"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanList } from "@/components/LoanList";

export default function IncomingPage() {
  const loans = useQuery(api.loans.listIncoming);
  const pending = loans?.filter((l) => l.status === "pending");
  const rest = loans?.filter((l) => l.status !== "pending");

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-6 text-2xl font-bold">Incoming requests</h1>
        <LoanList
          loans={pending}
          perspective="lender"
          emptyText="No one is waiting on you right now."
        />
      </section>
      {rest && rest.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-stone-700">Active and past loans</h2>
          <LoanList loans={rest} perspective="lender" emptyText="" />
        </section>
      )}
    </div>
  );
}
