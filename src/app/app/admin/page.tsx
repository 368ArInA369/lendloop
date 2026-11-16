"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { LoanList } from "@/components/LoanList";
import { StatusBadge } from "@/components/StatusBadge";
import { categoryLabel } from "@/lib/categories";

/**
 * Admin console. The queries used here throw for non-admins, so this page
 * degrades to an error state rather than leaking anything if the role check
 * in AppNav is ever bypassed.
 */
export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <p className="text-sm text-stone-500">Loading…</p>;
  if (me === null || me.role !== "admin") {
    return <p className="text-sm text-stone-600">This area is for administrators.</p>;
  }
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Admin</h1>
      <UsersSection />
      <ToolsSection />
      <LoansSection />
    </div>
  );
}

function UsersSection() {
  const users = useQuery(api.users.listAll);
  const setTrusted = useMutation(api.users.setTrustedLender);
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Neighbours</h2>
      {users === undefined ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {users.map((u) => (
            <li key={u._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <div>
                <span className="font-medium">{u.name}</span>
                <span className="ml-2 text-stone-500">{u.email}</span>
                {u.role === "admin" && (
                  <span className="ml-2 rounded bg-stone-900 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                    admin
                  </span>
                )}
              </div>
              <button
                className={u.trustedLender ? "btn-secondary" : "btn-primary"}
                onClick={() => setTrusted({ userId: u._id, trusted: !u.trustedLender })}
              >
                {u.trustedLender ? "Remove trusted" : "Mark trusted lender"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ToolsSection() {
  const tools = useQuery(api.tools.list, {});
  const remove = useMutation(api.tools.remove);
  const [error, setError] = useState<string | null>(null);

  const onRemove = async (toolId: Id<"tools">) => {
    if (!confirm("Remove this listing for everyone?")) return;
    setError(null);
    try {
      await remove({ toolId });
    } catch (e) {
      const data = (e as { data?: unknown }).data;
      setError(typeof data === "string" ? data : "Could not remove the listing");
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">All listings</h2>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      {tools === undefined ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {tools.map((t) => (
            <li key={t._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <span className="text-stone-500">
                  {categoryLabel(t.category)} · {t.ownerName}
                </span>
                <StatusBadge status={t.isAvailable ? "available" : "on_loan"} />
              </div>
              <button className="btn-danger" onClick={() => onRemove(t._id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LoansSection() {
  const loans = useQuery(api.loans.listAll);
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">All loans</h2>
      <LoanList loans={loans} perspective="admin" emptyText="No loan requests yet." />
    </section>
  );
}
