"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BorrowDialog } from "@/components/BorrowDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { CATEGORIES, categoryLabel, type Category } from "@/lib/categories";

export default function BrowsePage() {
  const [category, setCategory] = useState<Category | "">("");
  const tools = useQuery(api.tools.list, category ? { category } : {});
  const [borrowing, setBorrowing] = useState<{ id: Id<"tools">; name: string } | null>(null);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">All tools</h1>
        <select
          className="input w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "")}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {tools === undefined ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : tools.length === 0 ? (
        <p className="text-sm text-stone-500">No tools in this category yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool._id} className="card flex flex-col">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="font-semibold">{tool.name}</h2>
                <StatusBadge status={tool.isAvailable ? "available" : "on_loan"} />
              </div>
              <p className="text-xs text-stone-500">
                {categoryLabel(tool.category)} · {tool.condition}
              </p>
              {tool.description && (
                <p className="mt-2 text-sm text-stone-700">{tool.description}</p>
              )}
              <p className="mt-3 text-xs text-stone-500">
                Lent by {tool.isMine ? "you" : tool.ownerName}
                {tool.ownerTrusted && (
                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    Trusted
                  </span>
                )}
              </p>
              <div className="mt-auto pt-3">
                {!tool.isMine && (
                  <button
                    className="btn-primary w-full"
                    disabled={!tool.isAvailable}
                    onClick={() => setBorrowing({ id: tool._id, name: tool.name })}
                  >
                    {tool.isAvailable ? "Request to borrow" : "Currently on loan"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {borrowing && (
        <BorrowDialog
          toolId={borrowing.id}
          toolName={borrowing.name}
          onClose={() => setBorrowing(null)}
        />
      )}
    </div>
  );
}
