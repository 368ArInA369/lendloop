import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));

export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);

export const toolCategoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);

export default defineSchema({
  // One row per Clerk identity. Role lives here (never in the client) so every
  // Convex function can check it server-side.
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: roleValidator,
    trustedLender: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: v.string(),
    description: v.string(),
    // Denormalised: false while an approved loan is open. Kept in sync by loans.ts.
    isAvailable: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"])
    .index("by_available", ["isAvailable"]),

  loanRequests: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"), // denormalised from the tool for cheap "incoming" queries
    borrowerId: v.id("users"),
    status: loanStatusValidator,
    startDate: v.number(), // UTC midnight, ms
    endDate: v.number(),
    dueDate: v.number(), // equals endDate today; separate so extensions are possible later
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_status_dueDate", ["status", "dueDate"]),

  // Activity log shown on each loan ("Reminder sent 2 days ago").
  // idempotencyKey makes writes from retried n8n runs no-ops.
  automationEvents: defineTable({
    loanId: v.id("loanRequests"),
    kind: v.string(), // notification_sent | notification_failed | reminder_sent | reminder_failed
    source: v.union(v.literal("convex"), v.literal("n8n")),
    idempotencyKey: v.string(),
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_loan", ["loanId"])
    .index("by_key", ["idempotencyKey"]),

  // One reminder per loan per calendar day, regardless of how many times n8n retries.
  reminders: defineTable({
    loanId: v.id("loanRequests"),
    dayKey: v.string(), // YYYY-MM-DD (UTC)
    status: v.union(v.literal("sent"), v.literal("failed")),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_loan_day", ["loanId", "dayKey"]),
});
