import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  requireSecret,
  verifySignature,
} from "./lib/signing";

/**
 * Endpoints called by n8n. Both require a valid HMAC signature:
 *   - bodiless GET: signed string is "<timestamp>.GET /overdue-loans"
 *   - POST:         signed string is "<timestamp>.<raw json body>"
 * Timestamps older than 5 minutes are rejected (replay protection).
 */
const http = httpRouter();

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(request: Request, signedBody: string): Promise<Response | null> {
  let secret: string;
  try {
    secret = requireSecret();
  } catch {
    console.error("N8N_WEBHOOK_SECRET missing; refusing request");
    return json(500, { error: "server not configured" });
  }
  const result = await verifySignature({
    secret,
    timestamp: request.headers.get(TIMESTAMP_HEADER),
    signature: request.headers.get(SIGNATURE_HEADER),
    body: signedBody,
  });
  if (!result.ok) {
    console.warn(`rejected ${request.method} ${new URL(request.url).pathname}: ${result.reason}`);
    return json(401, { error: "unauthorized" });
  }
  return null;
}

http.route({
  path: "/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const denied = await authenticate(request, "GET /overdue-loans");
    if (denied) return denied;
    const loans = await ctx.runQuery(internal.reminders.overdue, { now: Date.now() });
    return json(200, { generatedAt: new Date().toISOString(), loans });
  }),
});

http.route({
  path: "/reminder-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const denied = await authenticate(request, raw);
    if (denied) return denied;

    let body: { loanId?: string; dayKey?: string; status?: string; error?: string };
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "invalid json" });
    }
    const { loanId, dayKey, status, error } = body;
    if (
      typeof loanId !== "string" ||
      typeof dayKey !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) ||
      (status !== "sent" && status !== "failed")
    ) {
      return json(400, { error: "expected { loanId, dayKey: YYYY-MM-DD, status: sent|failed }" });
    }

    try {
      const result = await ctx.runMutation(internal.reminders.recordStatus, {
        loanId: loanId as Id<"loanRequests">,
        dayKey,
        status,
        error: typeof error === "string" ? error.slice(0, 500) : undefined,
      });
      // 200 for duplicates as well: n8n treats the retry as settled.
      return json(result.ok ? 200 : 404, result);
    } catch (e) {
      // Malformed ids throw inside the mutation; surface as a client error.
      console.warn("reminder-status rejected", e);
      return json(400, { error: "invalid loanId" });
    }
  }),
});

export default http;
