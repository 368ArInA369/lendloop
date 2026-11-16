import { internalMutation } from "./_generated/server";

const DAY_MS = 86_400_000;
const day = (offset: number) => Math.floor(Date.now() / DAY_MS) * DAY_MS + offset * DAY_MS;

/**
 * Sample data for a fresh deployment:
 *   npx convex run seed:run
 * Seed users have synthetic clerkIds, so they cannot sign in; they exist to give
 * the board some tools and one overdue loan for the reminder workflow to pick up.
 * Safe to re-run: it does nothing if a seed user already exists.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const marker = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", "seed:alex"))
      .unique();
    if (marker) return "already seeded";

    const now = Date.now();
    const mkUser = (key: string, name: string, email: string, trusted = false) =>
      ctx.db.insert("users", {
        clerkId: `seed:${key}`,
        email,
        name,
        role: "user",
        trustedLender: trusted,
        createdAt: now,
      });

    const alex = await mkUser("alex", "Alex N.", "alex.n@example.com", true);
    const maria = await mkUser("maria", "Maria K.", "maria.k@example.com");
    const tomas = await mkUser("tomas", "Tomas R.", "tomas.r@example.com");

    const mkTool = (
      ownerId: typeof alex,
      name: string,
      category: "power_tools" | "hand_tools" | "garden" | "kitchen" | "camping" | "cleaning" | "other",
      condition: string,
      description: string,
      isAvailable = true,
    ) =>
      ctx.db.insert("tools", {
        ownerId,
        name,
        category,
        condition,
        description,
        isAvailable,
        createdAt: now,
      });

    const drill = await mkTool(
      alex,
      "Bosch cordless drill",
      "power_tools",
      "Good",
      "18V, two batteries and a charger. Comes with a basic bit set.",
    );
    await mkTool(alex, "Hedge trimmer", "garden", "Good", "Electric, 50 cm blade. Bring a 20 m extension cord.");
    await mkTool(alex, "Stand mixer", "kitchen", "Like new", "KitchenAid with dough hook and whisk. Please wash before returning.");
    const tent = await mkTool(
      maria,
      "4-person tent",
      "camping",
      "Fair",
      "Two small patches on the fly sheet, still waterproof. Pegs included.",
      false,
    );
    await mkTool(maria, "Pressure washer", "cleaning", "Good", "Kärcher K4. Hose and patio attachment included.");
    await mkTool(maria, "Socket wrench set", "hand_tools", "Good", "72-piece metric set in a hard case.");
    await mkTool(tomas, "Wheelbarrow", "garden", "Fair", "Steel tray, pneumatic tyre. Lives in the back garden, just knock.");
    await mkTool(tomas, "Camping stove", "camping", "Good", "Two-burner gas stove. Gas canister not included.");
    await mkTool(tomas, "Orbital sander", "power_tools", "Like new", "Makita 125 mm with dust bag. A few spare discs in the box.");

    // Pending request Maria -> Alex's drill (lands in Alex's "Incoming").
    await ctx.db.insert("loanRequests", {
      toolId: drill,
      ownerId: alex,
      borrowerId: maria,
      status: "pending",
      startDate: day(2),
      endDate: day(4),
      dueDate: day(4),
      note: "Putting up shelves on Saturday.",
      createdAt: now,
      updatedAt: now,
    });

    // Overdue loan Tomas -> Maria's tent (shows up in GET /overdue-loans).
    await ctx.db.insert("loanRequests", {
      toolId: tent,
      ownerId: maria,
      borrowerId: tomas,
      status: "approved",
      startDate: day(-9),
      endDate: day(-3),
      dueDate: day(-3),
      createdAt: now - 10 * DAY_MS,
      updatedAt: now - 9 * DAY_MS,
    });

    return "seeded 3 users, 9 tools, 2 loan requests";
  },
});
