"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanList } from "@/components/LoanList";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.listMine);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My requests</h1>
      <LoanList
        loans={loans}
        perspective="borrower"
        emptyText="You have not asked to borrow anything yet. Browse the board to find a tool."
      />
    </div>
  );
}
