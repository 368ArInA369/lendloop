import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertCanManageTool,
  getToolOrThrow,
  requireUser,
} from "./lib/auth";
import { toolCategoryValidator } from "./schema";

const toolFields = {
  name: v.string(),
  category: toolCategoryValidator,
  condition: v.string(),
  description: v.string(),
};

function validateToolInput(input: { name: string; condition: string; description: string }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new ConvexError("Name must be 2-80 characters");
  if (input.condition.trim().length === 0 || input.condition.length > 40) {
    throw new ConvexError("Condition is required (max 40 characters)");
  }
  if (input.description.length > 500) throw new ConvexError("Description max 500 characters");
  return {
    name,
    condition: input.condition.trim(),
    description: input.description.trim(),
  };
}

/**
 * Public board. Deliberately returns only name + category + id: no owner,
 * condition or description leaks to anonymous visitors.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_available", (q) => q.eq("isAvailable", true))
      .order("desc")
      .take(100);
    return tools.map(({ _id, name, category }) => ({ _id, name, category }));
  },
});

/** Signed-in board: every tool with availability, optionally filtered by category. */
export const list = query({
  args: { category: v.optional(toolCategoryValidator) },
  handler: async (ctx, { category }) => {
    const me = await requireUser(ctx);
    const tools = category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", category))
          .order("desc")
          .collect()
      : await ctx.db.query("tools").order("desc").collect();

    // Resolve owner display names in one pass; emails stay private.
    const ownerIds = Array.from(new Set(tools.map((t) => t.ownerId)));
    const owners = await Promise.all(ownerIds.map((id) => ctx.db.get(id)));
    const ownerById = new Map(ownerIds.map((id, i) => [id, owners[i]]));

    return tools.map((t) => {
      const owner = ownerById.get(t.ownerId);
      return {
        ...t,
        ownerName: owner?.name ?? "Unknown",
        ownerTrusted: owner?.trustedLender ?? false,
        isMine: t.ownerId === me._id,
      };
    });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    return ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await requireUser(ctx);
    return ctx.db.get(toolId);
  },
});

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const clean = validateToolInput(args);
    return ctx.db.insert("tools", {
      ownerId: me._id,
      category: args.category,
      ...clean,
      isAvailable: true,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    const me = await requireUser(ctx);
    const tool = await getToolOrThrow(ctx, toolId);
    assertCanManageTool(me, tool);
    const clean = validateToolInput(args);
    await ctx.db.patch(toolId, { category: args.category, ...clean });
  },
});

/**
 * Owner or admin. Open requests are cancelled/declined so borrowers are not
 * left with dangling pending rows; history (returned/declined) is kept.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await getToolOrThrow(ctx, toolId);
    assertCanManageTool(me, tool);

    const open = await ctx.db
      .query("loanRequests")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    const now = Date.now();
    for (const loan of open) {
      if (loan.status === "approved") {
        throw new ConvexError("Mark the current loan as returned before deleting this tool");
      }
      if (loan.status === "pending") {
        await ctx.db.patch(loan._id, { status: "declined", updatedAt: now });
      }
    }
    await ctx.db.delete(toolId);
  },
});
