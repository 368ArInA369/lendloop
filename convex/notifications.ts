import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  computeSignature,
  nowTimestamp,
  requireSecret,
} from "./lib/signing";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [10_000, 60_000];

const eventValidator = v.union(
  v.literal("request_created"),
  v.literal("request_approved"),
  v.literal("request_declined"),
  v.literal("request_cancelled"),
  v.literal("loan_returned"),
);

/**
 * Builds the webhook payload with only the fields n8n needs to write one
 * message. No internal ids except the loan id, no second party's email.
 */
export const buildPayload = internalQuery({
  args: { loanId: v.id("loanRequests"), event: eventValidator },
  handler: async (ctx, { loanId, event }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return null;
    const [tool, owner, borrower] = await Promise.all([
      ctx.db.get(loan.toolId),
      ctx.db.get(loan.ownerId),
      ctx.db.get(loan.borrowerId),
    ]);
    // Lender hears about new/cancelled requests; borrower hears about decisions.
    const recipient =
      event === "request_created" || event === "request_cancelled" ? owner : borrower;
    const counterpart = recipient === owner ? borrower : owner;
    if (!recipient) return null;

    return {
      event,
      loanId,
      status: loan.status,
      toolName: tool?.name ?? "a tool",
      startDate: new Date(loan.startDate).toISOString().slice(0, 10),
      endDate: new Date(loan.endDate).toISOString().slice(0, 10),
      recipient: { name: recipient.name, email: recipient.email },
      counterpartName: counterpart?.name ?? "A neighbour",
      // Idempotency key: same loan + same transition never notifies twice,
      // even if this action is retried after a partial failure.
      idempotencyKey: `${loanId}:${event}:${loan.updatedAt}`,
    };
  },
});

/**
 * POSTs the signed event to the n8n webhook. Scheduled from loans.ts mutations.
 * Retries itself with backoff; after the last failure it records a visible
 * `notification_failed` event instead of failing silently.
 */
export const sendRequestEvent = internalAction({
  args: { loanId: v.id("loanRequests"), event: eventValidator, attempt: v.number() },
  handler: async (ctx, { loanId, event, attempt }) => {
    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    if (!url) {
      console.warn("N8N_REQUEST_WEBHOOK_URL not set; skipping notification", { loanId, event });
      return;
    }
    const payload = await ctx.runQuery(internal.notifications.buildPayload, { loanId, event });
    if (!payload) return;

    const body = JSON.stringify(payload);
    const timestamp = nowTimestamp();
    const signature = await computeSignature(requireSecret(), timestamp, body);

    let error: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
        },
        body,
      });
      if (!res.ok) error = `n8n responded ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    if (!error) {
      await ctx.runMutation(internal.notifications.recordEvent, {
        loanId,
        kind: "notification_sent",
        idempotencyKey: payload.idempotencyKey,
        message: `Notified ${payload.recipient.name} about ${event.replace("_", " ")}`,
      });
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn(`notification attempt ${attempt} failed: ${error}; retrying`);
      await ctx.scheduler.runAfter(
        RETRY_DELAYS_MS[attempt - 1] ?? 60_000,
        internal.notifications.sendRequestEvent,
        { loanId, event, attempt: attempt + 1 },
      );
      return;
    }

    console.error(`notification permanently failed for loan ${loanId}: ${error}`);
    await ctx.runMutation(internal.notifications.recordEvent, {
      loanId,
      kind: "notification_failed",
      idempotencyKey: `${payload.idempotencyKey}:failed`,
      message: `Could not notify ${payload.recipient.name} (${error})`,
    });
  },
});

/** Idempotent insert into the activity log. */
export const recordEvent = internalMutation({
  args: {
    loanId: v.id("loanRequests"),
    kind: v.string(),
    idempotencyKey: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("automationEvents", {
      ...args,
      source: "convex",
      createdAt: Date.now(),
    });
  },
});
