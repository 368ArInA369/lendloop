"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { categoryLabel } from "@/lib/categories";

/** Anonymous view: the query itself only returns name + category. */
export function PublicToolList() {
  const tools = useQuery(api.tools.listPublic);

  if (tools === undefined) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }
  if (tools.length === 0) {
    return <p className="text-sm text-stone-500">Nothing listed yet. Be the first to lend something.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {tools.map((tool) => (
        <li key={tool._id} className="card flex items-center justify-between">
          <span className="font-medium">{tool.name}</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
            {categoryLabel(tool.category)}
          </span>
        </li>
      ))}
    </ul>
  );
}
