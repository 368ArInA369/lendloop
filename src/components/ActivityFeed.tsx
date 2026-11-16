import { timeAgo } from "@/lib/format";

type Event = {
  _id: string;
  kind: string;
  message: string;
  createdAt: number;
  source: "convex" | "n8n";
};

/** "Reminder sent 2 days ago" style log of automation touching a loan. */
export function ActivityFeed({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return <p className="text-xs text-stone-400">No automation activity yet.</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {events.map((e) => (
        <li key={e._id} className="flex items-start gap-2 text-stone-600">
          <span
            className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
              e.kind.endsWith("failed") ? "bg-red-500" : "bg-emerald-500"
            }`}
          />
          <span>
            {e.message}
            <span className="text-stone-400">
              {" "}
              · {timeAgo(e.createdAt)} · {e.source}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
