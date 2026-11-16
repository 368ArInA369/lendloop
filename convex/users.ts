import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getOptionalUser, requireAdmin } from "./lib/auth";
import { roleValidator } from "./schema";

/** Emails listed in the ADMIN_EMAILS deployment variable become admins on sign-in. */
function isAllowlistedAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Current user's own profile (role, trusted flag). Null when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    if (!user) return null;
    const { _id, name, email, role, trustedLender } = user;
    return { _id, name, email, role, trustedLender };
  },
});

/**
 * Called by the client once after sign-in. Creates the users row from the Clerk
 * identity, or refreshes name/email. The role is never taken from the client.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in required");

    const email = identity.email ?? "";
    const name =
      identity.name ??
      identity.nickname ??
      (email ? email.split("@")[0] : "Neighbour");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      const promote = existing.role !== "admin" && isAllowlistedAdmin(email);
      if (existing.email !== email || existing.name !== name || promote) {
        await ctx.db.patch(existing._id, {
          email,
          name,
          ...(promote ? { role: "admin" as const } : {}),
        });
      }
      return existing._id;
    }

    return ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      name,
      role: isAllowlistedAdmin(email) ? "admin" : "user",
      trustedLender: false,
      createdAt: Date.now(),
    });
  },
});

/** Admin: directory of neighbours with their flags. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map(({ _id, name, email, role, trustedLender, createdAt }) => ({
      _id,
      name,
      email,
      role,
      trustedLender,
      createdAt,
    }));
  },
});

/** Admin: mark or unmark a lender as trusted. */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("User not found");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

/**
 * Operator-only role change, not callable from the client:
 *   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) throw new ConvexError(`No user with email ${email} (sign in once first)`);
    await ctx.db.patch(user._id, { role });
    return { userId: user._id, role };
  },
});
