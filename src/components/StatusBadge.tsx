const styles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  declined: "bg-stone-200 text-stone-700",
  returned: "bg-sky-100 text-sky-800",
  cancelled: "bg-stone-200 text-stone-700",
  overdue: "bg-red-100 text-red-800",
  available: "bg-emerald-100 text-emerald-800",
  on_loan: "bg-stone-200 text-stone-700",
};

const labels: Record<string, string> = {
  on_loan: "On loan",
};

export function StatusBadge({ status }: { status: string }) {
  const label = labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[status] ?? "bg-stone-100 text-stone-700"
      }`}
    >
      {label}
    </span>
  );
}
