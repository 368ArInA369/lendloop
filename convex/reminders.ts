import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Data for the daily n8n reminder run. Minimal on purpose: the workflow needs
 * a loan id (for the write-back), who to write to and what about. Nothing else.
 */
export const overdue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const loans = await ctx.db
      .query("loanRequests")
      .withIndex("by_status_dueDate", (q) => q.eq("status", "approved").lt("dueDate", now))
      .take(200);

    const rows = await Promise.all(
      loans.map(async (loan) => {
        const [tool, borrower] = await Promise.all([
          ctx.db.get(loan.toolId),
          ctx.db.get(loan.borrowerId),
        ]);
        if (!borrower) return null;
        return {
          loanId: loan._id,
          toolName: tool?.name ?? "a tool",
          dueDate: new Date(loan.dueDate).toISOString().slice(0, 10),
          daysOverdue: Math.floor((now - loan.dueDate) / 86_400_000),
          borrowerName: borrower.name,
          borrowerEmail: borrower.email,
        };
      }),
    );
    return rows.filter((r) => r !== null);
  },
});

/**
 * Write-back from n8n. Idempotent on (loanId, dayKey): a retried run updates the
 * existing row and increments `attempts` instead of creating a second reminder.
 * The activity-feed event is keyed the same way.
 */
export const recordStatus = internalMutation({
  args: {
    loanId: v.id("loanRequests"),
    dayKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { loanId, dayKey, status, error }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return { ok: false as const, reason: "loan not found" };

    const now = Date.now();
    const existing = await ctx.db
      .query("reminders")
      .withIndex("by_loan_day", (q) => q.eq("loanId", loanId).eq("dayKey", dayKey))
      .unique();

    if (existing) {
      // A "sent" result is final for the day; a later failure must not downgrade it.
      if (existing.status === "sent") return { ok: true as const, duplicate: true };
      await ctx.db.patch(existing._id, {
        status,
        attempts: existing.attempts + 1,
        lastError: error,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("reminders", {
        loanId,
        dayKey,
        status,
        attempts: 1,
        lastError: error,
        createdAt: now,
        updatedAt: now,
      });
    }

    const idempotencyKey = `reminder:${loanId}:${dayKey}:${status}`;
    const dup = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    if (!dup) {
      await ctx.db.insert("automationEvents", {
        loanId,
        kind: status === "sent" ? "reminder_sent" : "reminder_failed",
        source: "n8n",
        idempotencyKey,
        message:
          status === "sent"
            ? "Overdue reminder sent to borrower"
            : `Overdue reminder failed${error ? `: ${error.slice(0, 120)}` : ""}`,
        createdAt: now,
      });
    }
    return { ok: true as const, duplicate: existing !== null };
  },
});
