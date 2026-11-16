import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  assertInvolvedInLoan,
  assertIsBorrower,
  assertIsLender,
  getLoanOrThrow,
  getToolOrThrow,
  requireAdmin,
  requireUser,
} from "./lib/auth";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOAN_DAYS = 30;

export type LoanEvent =
  | "request_created"
  | "request_approved"
  | "request_declined"
  | "request_cancelled"
  | "loan_returned";

/** Queue the outbound n8n notification. Runs after the mutation commits. */
async function notify(ctx: MutationCtx, loanId: Id<"loanRequests">, event: LoanEvent) {
  await ctx.scheduler.runAfter(0, internal.notifications.sendRequestEvent, {
    loanId,
    event,
    attempt: 1,
  });
}

/** Attach display names + recent automation events to a loan row. */
async function enrich(ctx: QueryCtx, loan: Doc<"loanRequests">) {
  const [tool, owner, borrower, events] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.ownerId),
    ctx.db.get(loan.borrowerId),
    ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .order("desc")
      .take(5),
  ]);
  return {
    ...loan,
    toolName: tool?.name ?? "(deleted tool)",
    ownerName: owner?.name ?? "Unknown",
    borrowerName: borrower?.name ?? "Unknown",
    isOverdue: loan.status === "approved" && loan.dueDate < Date.now(),
    activity: events.map(({ _id, kind, message, createdAt, source }) => ({
      _id,
      kind,
      message,
      createdAt,
      source,
    })),
  };
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loanRequests")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .collect();
    return Promise.all(loans.map((l) => enrich(ctx, l)));
  },
});

export const listIncoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loanRequests")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .collect();
    return Promise.all(loans.map((l) => enrich(ctx, l)));
  },
});

/** Admin only: every loan in the neighbourhood. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loanRequests").order("desc").take(200);
    return Promise.all(loans.map((l) => enrich(ctx, l)));
  },
});

/** Full automation history for one loan (either party or admin). */
export const activity = query({
  args: { loanId: v.id("loanRequests") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    assertInvolvedInLoan(me, loan);
    return ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(50);
  },
});

export const create = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.number(),
    endDate: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { toolId, startDate, endDate, note }) => {
    const me = await requireUser(ctx);
    const tool = await getToolOrThrow(ctx, toolId);
    if (tool.ownerId === me._id) throw new ConvexError("You cannot borrow your own tool");
    if (!tool.isAvailable) throw new ConvexError("This tool is currently on loan");

    const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
    if (startDate % DAY_MS !== 0 || endDate % DAY_MS !== 0) {
      throw new ConvexError("Dates must be whole days");
    }
    if (startDate < today) throw new ConvexError("Start date cannot be in the past");
    if (endDate < startDate) throw new ConvexError("End date must be after start date");
    if ((endDate - startDate) / DAY_MS > MAX_LOAN_DAYS) {
      throw new ConvexError(`Loans are limited to ${MAX_LOAN_DAYS} days`);
    }
    if (note && note.length > 300) throw new ConvexError("Note max 300 characters");

    const duplicate = await ctx.db
      .query("loanRequests")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .filter((q) =>
        q.and(q.eq(q.field("toolId"), toolId), q.eq(q.field("status"), "pending")),
      )
      .first();
    if (duplicate) throw new ConvexError("You already have a pending request for this tool");

    const now = Date.now();
    const loanId = await ctx.db.insert("loanRequests", {
      toolId,
      ownerId: tool.ownerId,
      borrowerId: me._id,
      status: "pending",
      startDate,
      endDate,
      dueDate: endDate,
      note: note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    await notify(ctx, loanId, "request_created");
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loanRequests") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    assertIsLender(me, loan);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be approved");
    const tool = await getToolOrThrow(ctx, loan.toolId);
    if (!tool.isAvailable) throw new ConvexError("Tool is already on loan");

    await ctx.db.patch(loanId, { status: "approved", updatedAt: Date.now() });
    await ctx.db.patch(tool._id, { isAvailable: false });
    await notify(ctx, loanId, "request_approved");
  },
});

export const decline = mutation({
  args: { loanId: v.id("loanRequests") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    assertIsLender(me, loan);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be declined");
    await ctx.db.patch(loanId, { status: "declined", updatedAt: Date.now() });
    await notify(ctx, loanId, "request_declined");
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loanRequests") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    assertIsBorrower(me, loan);
    if (loan.status !== "pending" && loan.status !== "approved") {
      throw new ConvexError("This request can no longer be cancelled");
    }
    await ctx.db.patch(loanId, { status: "cancelled", updatedAt: Date.now() });
    if (loan.status === "approved") {
      await ctx.db.patch(loan.toolId, { isAvailable: true });
    }
    await notify(ctx, loanId, "request_cancelled");
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loanRequests") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    assertIsLender(me, loan);
    if (loan.status !== "approved") throw new ConvexError("Only active loans can be returned");
    const now = Date.now();
    await ctx.db.patch(loanId, { status: "returned", returnedAt: now, updatedAt: now });
    await ctx.db.patch(loan.toolId, { isAvailable: true });
    await notify(ctx, loanId, "loan_returned");
  },
});
