import { DAY_MS } from "./util";

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export interface TimedItem {
  kind: string;
  state: string;
  createdAt: Date | null;
  mergedAt: Date | null;
  firstResponseAt: Date | null;
}

/** Median hours from open → first non-author response, and open → merge. */
export function responseMetrics(items: TimedItem[]): {
  medianFirstResponseHours: number | null;
  medianTimeToMergeHours: number | null;
  responded: number;
  merged: number;
} {
  const fr: number[] = [];
  const tm: number[] = [];
  for (const i of items) {
    if (!i.createdAt) continue;
    if (i.firstResponseAt)
      fr.push((i.firstResponseAt.getTime() - i.createdAt.getTime()) / 3_600_000);
    if (i.kind === "pr" && i.mergedAt)
      tm.push((i.mergedAt.getTime() - i.createdAt.getTime()) / 3_600_000);
  }
  return {
    medianFirstResponseHours: median(fr),
    medianTimeToMergeHours: median(tm),
    responded: fr.length,
    merged: tm.length,
  };
}

/** YYYY-MM-DD in the given IANA time zone. */
export function dayKey(d: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Current and longest streak of consecutive active days, given the set of active day keys. */
export function streaks(
  activeDays: Set<string>,
  today: Date,
  timeZone = "UTC",
): { current: number; longest: number } {
  const sorted = [...activeDays].sort();
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of sorted) {
    const t = Date.parse(`${k}T00:00:00Z`);
    run = prev != null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  let current = 0;
  const cursor = new Date(Date.parse(`${dayKey(today, timeZone)}T00:00:00Z`));
  // A streak survives until the end of today even if today has no activity yet.
  if (!activeDays.has(dayKey(cursor, "UTC"))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (activeDays.has(dayKey(cursor, "UTC"))) {
    current++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current, longest };
}

export function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return days < 14 ? `${days.toFixed(days < 3 ? 1 : 0)}d` : `${Math.round(days / 7)}w`;
}
