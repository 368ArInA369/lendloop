const DAY_MS = 86_400_000;

/** "2026-03-14" -> UTC midnight in ms (what Convex stores). */
export function dateInputToMs(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

/** ms -> "2026-03-14" for <input type="date">. */
export function msToDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayInput(): string {
  return msToDateInput(Math.floor(Date.now() / DAY_MS) * DAY_MS);
}

export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function formatRange(start: number, end: number): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
