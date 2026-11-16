# LendLoop

*Borrow what you need. Lend what you don't.*

A neighbourhood tool-lending board. Neighbours list tools, ask to borrow them for a date range, approve or decline requests, and mark loans as returned. Notifications and overdue reminders are handled by n8n workflows that talk to the Convex backend over HMAC-signed HTTP in both directions.

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind v4) · Clerk (auth) · Convex (data, backend logic, HTTP endpoints) · n8n (self-hosted via Docker) .

---

## Contents

1. [Architecture](#architecture)
2. [Local setup](#local-setup)
3. [Environment variables](#environment-variables)
4. [Roles and access control](#roles-and-access-control)
5. [Automation design (n8n)](#automation-design-n8n)
6. [Security and data minimisation](#security-and-data-minimisation)
7. [Idempotency and failure handling](#idempotency-and-failure-handling)
8. [Project layout](#project-layout)
9. [What I would change for production](#what-i-would-change-for-production)
10. [Known limitations](#known-limitations)

---

## Architecture

```
            ┌────────────────────────┐          Clerk JWT (template "convex")
 Browser ──►│  Next.js 15 App Router │◄────────────────────────────┐
            │  /        public board │                             │
            │  /app/*   Clerk-gated  │   useQuery / useMutation    │
            └───────────┬────────────┘   (WebSocket, JWT attached) │
                        │                                          │
                        ▼                                          │
            ┌────────────────────────┐     verifies JWT via        │
            │  Convex deployment     │◄─ auth.config.ts ───── Clerk ┘
            │  schema.ts, users.ts   │
            │  tools.ts, loans.ts    │──┐ scheduler.runAfter(0)
            │  lib/auth.ts (RBAC)    │  │
            │  notifications.ts  ◄───┘  │  signed POST (HMAC, timestamp)
            │  http.ts ──────────────────┼───────────────────────────────┐
            │   GET  /overdue-loans      │                               ▼
            │   POST /reminder-status    │             ┌──────────────────────────────┐
            └────────────▲───────────────┘             │  n8n (docker compose)        │
                         │  signed GET / signed POST   │  1 request-notification.json │
                         └─────────────────────────────┤  2 overdue-reminders.json    │
                                                       │  3 error-workflow.json       │
                                                       └──────────────────────────────┘
```

Request flow:

1. A mutation in `convex/loans.ts` changes a request's status and schedules `notifications.sendRequestEvent`.
2. The action builds a minimal payload, signs it (`convex/lib/signing.ts`) and POSTs to the n8n webhook. On success or final failure it writes an `automationEvents` row, which the UI shows under each loan ("Notified Maria K. about request approved · 2 min ago").
3. Workflow 1 verifies the signature in a Code node and sends an email, or logs a mock notification when no SMTP credential is configured.
4. Workflow 2 runs daily: signed GET to `/overdue-loans`, one reminder per loan, signed POST to `/reminder-status`. Convex stores one `reminders` row per `(loanId, dayKey)` and an activity event ("Overdue reminder sent to borrower").
5. Workflow 3 is the n8n Error Workflow for the other two: every failed execution produces an alert (email or log) with execution id and failing node.

## Local setup

Prerequisites: Node 20+, Docker Desktop, a free Clerk account and a free Convex account.

### 1. Install

```bash
git clone <this repo> lendloop && cd lendloop
npm install
cp .env.example .env.local
```

### 2. Clerk

1. Create an application at clerk.com (email + Google is enough).
2. Copy **Publishable key** and **Secret key** into `.env.local`.
3. *Configure → JWT templates → New template → Convex*. Keep the name `convex`. Copy the **Issuer** URL (looks like `https://xxxx.clerk.accounts.dev`).

### 3. Convex

```bash
npx convex dev
```

First run: log in, create a project. This writes `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` into `.env.local`, pushes the functions and keeps `convex/_generated` in sync. Leave it running. In a second terminal set the deployment variables:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://xxxx.clerk.accounts.dev
npx convex env set N8N_WEBHOOK_SECRET "$(openssl rand -hex 32)"      # or any 32+ random chars
npx convex env set N8N_REQUEST_WEBHOOK_URL http://localhost:5678/webhook/lendloop-request
npx convex env set ADMIN_EMAILS you@example.com                       # optional, see Roles
npx convex run seed:run                                               # sample tools + an overdue loan
```

> Convex cloud cannot reach `localhost:5678`. For end-to-end notifications on a laptop expose n8n with a tunnel (`ngrok http 5678`, Cloudflare Tunnel, …), set `N8N_PUBLIC_URL` in `n8n/.env` to that URL and use `<tunnel>/webhook/lendloop-request` for `N8N_REQUEST_WEBHOOK_URL`. Without a tunnel everything else works; the outbound notification records `notification_failed` after three attempts, visibly, on the loan.

### 4. n8n

```bash
cd n8n
cp .env.example .env
# fill in: N8N_ENCRYPTION_KEY (random), LENDLOOP_WEBHOOK_SECRET (same value as N8N_WEBHOOK_SECRET above),
#          CONVEX_SITE_URL (NEXT_PUBLIC_CONVEX_SITE_URL from .env.local)
docker compose up -d
```

Open http://localhost:5678, create the owner account (local only), then:

1. **Import** the three files in `n8n/` (*Workflows → Import from File*): `error-workflow.json` first, then `request-notification.json` and `overdue-reminders.json`.
2. In each of the two main workflows open *Settings* and pick **"LendLoop - Error handler"** as *Error workflow* (n8n assigns new ids on import, so the reference in the JSON is only a hint).
3. Optional email: *Credentials → New → SMTP*, name it exactly **`LendLoop SMTP`**, then open each *Send email* / *Email ops* node and select it. Set `LENDLOOP_NOTIFY_VIA=email` in `n8n/.env` and `docker compose up -d` again. Without this the workflows take the "mock" branch and the notification is the execution log.
4. **Activate** all three workflows. The webhook URL is `http://localhost:5678/webhook/lendloop-request`.
5. Test: *Overdue reminders → Execute workflow*. With the seed data one reminder is produced and the loan in the app shows "Overdue reminder sent to borrower".

### 5. Run the app

```bash
npm run dev          # http://localhost:3000
```

Sign in with two different accounts (two browsers) to see the lender/borrower sides. Quality gates: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Environment variables

| Where | Name | Purpose |
|---|---|---|
| `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk |
| `.env.local` | `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | written by `npx convex dev` |
| Convex deployment | `CLERK_JWT_ISSUER_DOMAIN` | JWT verification (`convex/auth.config.ts`) |
| Convex deployment | `N8N_WEBHOOK_SECRET` | HMAC secret, both directions |
| Convex deployment | `N8N_REQUEST_WEBHOOK_URL` | where request events are POSTed |
| Convex deployment | `ADMIN_EMAILS` | optional admin allowlist |
| `n8n/.env` | `LENDLOOP_WEBHOOK_SECRET` | must equal `N8N_WEBHOOK_SECRET` |
| `n8n/.env` | `CONVEX_SITE_URL` | base URL for `/overdue-loans` and `/reminder-status` |
| `n8n/.env` | `LENDLOOP_NOTIFY_VIA` | `mock` (default) or `email` |
| `n8n/.env` | `LENDLOOP_FROM_EMAIL`, `LENDLOOP_OPS_EMAIL` | sender and alert recipient |
| `n8n/.env` | `N8N_ENCRYPTION_KEY`, `N8N_PUBLIC_URL`, `TZ` | n8n itself |

No secret is read from code or workflow JSON. Workflows reference `$env.*` and a credential by name only.

## Roles and access control

* `users.role` is `user` or `admin`, stored in Convex and never accepted from the client.
* A user becomes admin either through the `ADMIN_EMAILS` allowlist (applied in `users.ensureUser` on sign-in) or by the operator: `npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'` (an `internalMutation`, not callable from the browser).
* Every public Convex function calls a helper from `convex/lib/auth.ts`: `requireUser`, `requireAdmin`, `assertCanManageTool` (owner or admin), `assertIsLender`, `assertIsBorrower`, `assertInvolvedInLoan`. The UI hides buttons too, but the checks that matter run in the function.
* Status transitions are validated server-side (only `pending → approved/declined`, only `approved → returned`, borrower can cancel `pending/approved`), and date rules (whole UTC days, not in the past, ≤ 30 days) live in `loans.create`.
* Admin can remove any listing, see all loans (`loans.listAll`) and toggle *Trusted Lender* (`users.setTrustedLender`).

## Automation design (n8n)

**Workflow 1 – Request notification** (`n8n/request-notification.json`)
`Webhook (raw body) → Verify signature (Code) → IF valid → Compose message → IF email configured → Send email | Log mock notification → Respond 200`, invalid signatures get `Respond 401`. The payload contains exactly: event, loanId, status, tool name, dates, recipient name + email, counterpart's display name and an idempotency key.

**Workflow 2 – Overdue reminders** (`n8n/overdue-reminders.json`)
`Schedule 09:00 daily → Sign GET → HTTP GET /overdue-loans (retry 3×) → Split into loans → IF email → Send reminder (retry 3×, error output) → Mark sent | Mark failed → Sign write-back → HTTP POST /reminder-status (retry 3×)`. A failed email still produces a write-back with `status: failed`, so the failure is visible on the loan.

**Workflow 3 – Error handler** (`n8n/error-workflow.json`)
`Error Trigger → Format alert → email ops | log`. Both main workflows declare it as their error workflow; failed executions are also kept in n8n (`EXECUTIONS_DATA_SAVE_ON_ERROR=all`).

## Security and data minimisation

* **Signed in both directions.** Header pair `X-LendLoop-Timestamp` / `X-LendLoop-Signature: v1=<hex>`; signature = HMAC-SHA256(secret, `"<timestamp>.<raw body>"`), or `"<timestamp>.GET /overdue-loans"` for the bodiless GET so a signature cannot be replayed against another endpoint. Receivers reject timestamps more than 5 minutes off and compare in constant time (`convex/lib/signing.ts`, Code nodes in n8n).
* **Raw-body hashing.** n8n's webhook runs with `rawBody: true` and the write-back is sent as a raw string, so both sides hash the exact bytes rather than a re-serialised object.
* **Secrets** live in Convex deployment variables and in the n8n container environment / credential store. The exported workflow JSON contains `$env.*` references and a credential *name*, nothing else.
* **Public page** gets `tools.listPublic`, which returns id, name and category only. Owner, condition and description require a session.
* **Signed-in board** shows owner display names, never emails. Emails leave Convex only to n8n, only for the one person being notified.
* **Overdue endpoint** returns loanId, tool name, due date, days overdue, borrower name and email. No owner data, no internal ids beyond the loan id.
* **Error alerts** contain workflow/execution metadata only, no payload bodies.
* **Clerk** protects `/app/*` in `src/middleware.ts`; Convex verifies the JWT independently, so a request that bypasses Next.js still has to carry a valid token.
* Input limits (name 2-80, description ≤ 500, note ≤ 300, loan ≤ 30 days) are enforced in mutations.

## Idempotency and failure handling

| Concern | Mechanism |
|---|---|
| Duplicate notification on retried action | key `${loanId}:${event}:${updatedAt}` on `automationEvents.by_key`; `recordEvent` is a no-op if present |
| Outbound webhook fails | `sendRequestEvent` re-schedules itself after 10 s and 60 s (3 attempts), then writes `notification_failed` to the loan's activity and logs an error |
| Duplicate reminder (re-run, retry) | one `reminders` row per `(loanId, dayKey)`; a second write-back increments `attempts` and returns `{duplicate: true}` with HTTP 200 so n8n treats the retry as settled; a `sent` result is never downgraded by a later `failed` |
| n8n HTTP/email node fails | `retryOnFail` (3 tries, 5 s apart); email node uses an error output so a failure becomes a `failed` write-back instead of aborting the run |
| Anything else fails | Error workflow alerts ops; execution data is saved for inspection |
| Bad or replayed signature | 401, logged with reason on the receiving side |

Verified locally against a Convex dev backend: unsigned and stale requests → 401, signed GET → 200 with the minimal row shape, two identical write-backs → one `reminders` row and one activity event, tampered body → 401, malformed body → 400.

## Project layout

```
convex/
  schema.ts            tables + indexes (users, tools, loanRequests, automationEvents, reminders)
  auth.config.ts       Clerk JWT provider
  lib/auth.ts          requireUser / requireAdmin / ownership assertions
  lib/signing.ts       HMAC sign + verify (Web Crypto)
  users.ts             ensureUser, me, admin: listAll, setTrustedLender; internal setRole
  tools.ts             listPublic, list, listMine, create, update, remove
  loans.ts             create, approve, decline, cancel, markReturned, listMine/Incoming/All, activity
  notifications.ts     outbound signed webhook action with retries + activity log
  reminders.ts         overdue query + idempotent write-back mutation
  http.ts              GET /overdue-loans, POST /reminder-status
  seed.ts              npx convex run seed:run
  _generated/          committed, regenerated by `npx convex dev`
src/
  middleware.ts        Clerk, protects /app/*
  app/page.tsx         public board
  app/app/…            browse, listings, requests, incoming, admin
  components/          ConvexClientProvider, AppNav, UserSync, LoanList, ToolForm, BorrowDialog, …
  lib/                 categories, date helpers
n8n/
  docker-compose.yml, .env.example, request-notification.json, overdue-reminders.json, error-workflow.json
SECURITY-NOTE.md       short note on a healthcare-like context
```

About `convex/_generated`: the files were produced by `npx convex dev` running against a local anonymous Convex dev deployment (`CONVEX_AGENT_MODE=anonymous`), which needs no account. They are committed so `tsc` and `next build` pass on a fresh clone; `npx convex dev` overwrites them with identical content.

## What I would change for production

* Replace the shared HMAC secret with per-direction secrets and rotate them (accept two `v1` keys during rotation).
* Move the public n8n webhook behind an allow-list / Cloudflare Access, run n8n with Postgres and queue mode, enable n8n user management and SSO.
* Use a transactional email provider (Resend/Postmark) with bounce handling, and store notification preferences per user; add Slack/Discord channels as alternative nodes.
* Replace Clerk JWT templates with Clerk webhooks for user lifecycle (deletion → anonymise `users` row) and add a GDPR export/delete path.
* Add rate limiting on `loans.create` and the HTTP endpoints, Convex `crons` as a fallback if the n8n schedule misses a day, and alerting on `notification_failed` counts.
* Add tests (Convex functions with `convex-test`, Playwright smoke test) and CI running `tsc`, `lint`, `build`, `convex codegen --typecheck`.
* Pin the n8n image digest, back up the `n8n_data` volume, and move `LENDLOOP_*` variables into n8n's external secrets provider.

## Known limitations

* Overlapping date ranges are not checked: a tool is simply unavailable while an approved loan is open, and pending requests for later dates stay pending until the owner decides.
* Reminders fire every day a loan is overdue (one per day); there is no escalation or cap.
* Convex IDs appear in notification idempotency keys; fine for n8n, but a public-facing system should use opaque keys.
* Seed users cannot sign in (synthetic Clerk ids); they exist to populate the board and the overdue endpoint.
* The error-workflow link in the exported JSON must be re-selected after import because n8n assigns new workflow ids.
* No pagination on lists (`take(200)` on admin loans, `take(100)` on the public board).
* End-to-end notification delivery was not exercised against a live Clerk/Convex cloud + tunnel; the Convex side was tested against a local dev backend and the n8n JSON was structurally validated but not executed.
