"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { StatusBadge } from "@/components/StatusBadge";
import { ToolForm } from "@/components/ToolForm";
import { categoryLabel } from "@/lib/categories";

export default function ListingsPage() {
  const tools = useQuery(api.tools.listMine);
  const remove = useMutation(api.tools.remove);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Doc<"tools"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async (toolId: Id<"tools">) => {
    if (!confirm("Delete this listing? Pending requests on it will be declined.")) return;
    setError(null);
    try {
      await remove({ toolId });
    } catch (e) {
      const data = (e as { data?: unknown }).data;
      setError(typeof data === "string" ? data : "Could not delete the listing");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My listings</h1>
        {!creating && !editing && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + List a tool
          </button>
        )}
      </div>

      {creating && <div className="mb-6"><ToolForm onDone={() => setCreating(false)} /></div>}
      {editing && (
        <div className="mb-6">
          <ToolForm tool={editing} onDone={() => setEditing(null)} />
        </div>
      )}
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      {tools === undefined ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : tools.length === 0 ? (
        <p className="text-sm text-stone-500">You have not listed anything yet.</p>
      ) : (
        <ul className="space-y-3">
          {tools.map((tool) => (
            <li key={tool._id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{tool.name}</span>
                  <StatusBadge status={tool.isAvailable ? "available" : "on_loan"} />
                </div>
                <p className="text-xs text-stone-500">
                  {categoryLabel(tool.category)} · {tool.condition}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setEditing(tool)}>
                  Edit
                </button>
                <button className="btn-danger" onClick={() => onDelete(tool._id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
