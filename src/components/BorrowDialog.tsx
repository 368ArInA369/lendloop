"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { dateInputToMs, todayInput } from "@/lib/format";

type Props = {
  toolId: Id<"tools">;
  toolName: string;
  onClose: () => void;
};

/** Inline date-range form for a borrow request. */
export function BorrowDialog({ toolId, toolName, onClose }: Props) {
  const createLoan = useMutation(api.loans.create);
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState(todayInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createLoan({
        toolId,
        startDate: dateInputToMs(start),
        endDate: dateInputToMs(end),
        note: note || undefined,
      });
      onClose();
    } catch (err) {
      const data = (err as { data?: unknown }).data;
      setError(typeof data === "string" ? data : "Could not send the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-sm space-y-3"
      >
        <h3 className="font-semibold">Borrow “{toolName}”</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="borrow-start">From</label>
            <input
              id="borrow-start"
              type="date"
              className="input"
              value={start}
              min={todayInput()}
              onChange={(e) => {
                setStart(e.target.value);
                if (e.target.value > end) setEnd(e.target.value);
              }}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="borrow-end">Until</label>
            <input
              id="borrow-end"
              type="date"
              className="input"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="borrow-note">Note for the owner (optional)</label>
          <input
            id="borrow-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="What you need it for, when you could pick it up"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            Send request
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
