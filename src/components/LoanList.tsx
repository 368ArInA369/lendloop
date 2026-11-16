"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatRange } from "@/lib/format";
import { ActivityFeed } from "./ActivityFeed";
import { StatusBadge } from "./StatusBadge";

export type Loan = FunctionReturnType<typeof api.loans.listMine>[number];

type Perspective = "borrower" | "lender" | "admin";

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "data" in e && typeof e.data === "string") return e.data;
  return e instanceof Error ? e.message : "Something went wrong";
}

export function LoanList({
  loans,
  perspective,
  emptyText,
}: {
  loans: Loan[] | undefined;
  perspective: Perspective;
  emptyText: string;
}) {
  if (loans === undefined) return <p className="text-sm text-stone-500">Loading…</p>;
  if (loans.length === 0) return <p className="text-sm text-stone-500">{emptyText}</p>;
  return (
    <ul className="space-y-3">
      {loans.map((loan) => (
        <LoanRow key={loan._id} loan={loan} perspective={perspective} />
      ))}
    </ul>
  );
}

function LoanRow({ loan, perspective }: { loan: Loan; perspective: Perspective }) {
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: (args: { loanId: Id<"loanRequests"> }) => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn({ loanId: loan._id });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const lenderSide = perspective === "lender" || perspective === "admin";
  const borrowerSide = perspective === "borrower" || perspective === "admin";
  const counterpart =
    perspective === "borrower"
      ? `from ${loan.ownerName}`
      : perspective === "lender"
        ? `requested by ${loan.borrowerName}`
        : `${loan.borrowerName} ← ${loan.ownerName}`;

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{loan.toolName}</span>
            <StatusBadge status={loan.status} />
            {loan.isOverdue && <StatusBadge status="overdue" />}
          </div>
          <p className="mt-1 text-sm text-stone-600">
            {formatRange(loan.startDate, loan.endDate)} · {counterpart}
          </p>
          {loan.note && <p className="mt-1 text-sm text-stone-500 italic">“{loan.note}”</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {lenderSide && loan.status === "pending" && (
            <>
              <button className="btn-primary" disabled={busy} onClick={() => run(approve)}>
                Approve
              </button>
              <button className="btn-secondary" disabled={busy} onClick={() => run(decline)}>
                Decline
              </button>
            </>
          )}
          {lenderSide && loan.status === "approved" && (
            <button className="btn-primary" disabled={busy} onClick={() => run(markReturned)}>
              Mark returned
            </button>
          )}
          {borrowerSide && (loan.status === "pending" || loan.status === "approved") && (
            <button className="btn-danger" disabled={busy} onClick={() => run(cancel)}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-3 border-t border-stone-100 pt-3">
        <ActivityFeed events={loan.activity} />
      </div>
    </li>
  );
}
