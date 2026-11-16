import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Authorization helpers. Every public query/mutation goes through one of these,
 * so access control is enforced in the backend regardless of what the UI shows.
 */

/** Returns the signed-in user's row, or null when signed out / not yet synced. */
export async function getOptionalUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in required");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  // The client calls users.ensureUser right after sign-in; this only fires if a
  // mutation races ahead of that sync.
  if (!user) throw new ConvexError("Account not initialised yet, retry in a moment");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError("Admin role required");
  return user;
}

export function isAdmin(user: Doc<"users">): boolean {
  return user.role === "admin";
}

export async function getToolOrThrow(ctx: Ctx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const tool = await ctx.db.get(toolId);
  if (!tool) throw new ConvexError("Tool not found");
  return tool;
}

/** Owner or admin may manage a tool. */
export function assertCanManageTool(user: Doc<"users">, tool: Doc<"tools">): void {
  if (tool.ownerId !== user._id && !isAdmin(user)) {
    throw new ConvexError("You can only manage your own listings");
  }
}

export async function getLoanOrThrow(
  ctx: Ctx,
  loanId: Id<"loanRequests">,
): Promise<Doc<"loanRequests">> {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new ConvexError("Request not found");
  return loan;
}

/** Lender-side actions (approve / decline / mark returned). */
export function assertIsLender(user: Doc<"users">, loan: Doc<"loanRequests">): void {
  if (loan.ownerId !== user._id && !isAdmin(user)) {
    throw new ConvexError("Only the tool owner can act on this request");
  }
}

/** Borrower-side actions (cancel). */
export function assertIsBorrower(user: Doc<"users">, loan: Doc<"loanRequests">): void {
  if (loan.borrowerId !== user._id && !isAdmin(user)) {
    throw new ConvexError("Only the borrower can act on this request");
  }
}

/** Either party, for reading details and activity. */
export function assertInvolvedInLoan(user: Doc<"users">, loan: Doc<"loanRequests">): void {
  if (loan.borrowerId !== user._id && loan.ownerId !== user._id && !isAdmin(user)) {
    throw new ConvexError("Not your request");
  }
}
