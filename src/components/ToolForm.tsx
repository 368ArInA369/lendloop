"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, type Category } from "@/lib/categories";

type Props = {
  /** When provided the form edits this tool, otherwise it creates one. */
  tool?: Doc<"tools">;
  onDone: () => void;
};

export function ToolForm({ tool, onDone }: Props) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [name, setName] = useState(tool?.name ?? "");
  const [category, setCategory] = useState<Category>(tool?.category ?? "power_tools");
  const [condition, setCondition] = useState(tool?.condition ?? CONDITIONS[1]);
  const [description, setDescription] = useState(tool?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fields = { name, category, condition, description };
      if (tool) await update({ toolId: tool._id, ...fields });
      else await create(fields);
      onDone();
    } catch (err) {
      const data = (err as { data?: unknown }).data;
      setError(typeof data === "string" ? data : "Could not save the listing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h3 className="font-semibold">{tool ? "Edit listing" : "List a tool"}</h3>
      <div>
        <label className="label" htmlFor="tool-name">Name</label>
        <input
          id="tool-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bosch cordless drill"
          required
          maxLength={80}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="tool-category">Category</label>
          <select
            id="tool-category"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tool-condition">Condition</label>
          <select
            id="tool-condition"
            className="input"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="tool-description">Short description</label>
        <textarea
          id="tool-description"
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is included, anything the borrower should know"
          maxLength={500}
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {tool ? "Save" : "Publish listing"}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
