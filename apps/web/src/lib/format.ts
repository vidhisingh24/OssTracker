import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from "date-fns";

export function relative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Math.abs(Date.now() - d.getTime());
  if (diff < 45_000) return "just now";
  const s = formatDistanceToNowStrict(d, { addSuffix: false })
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ weeks?/, "w")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y");
  return d.getTime() > Date.now() ? `in ${s}` : `${s} ago`;
}

export function fullDate(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "EEE d MMM yyyy, HH:mm") : "";
}

export function dueLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, d.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy");
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return format(d, d.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy");
}

export function slug(repo: string, number: number | null): string {
  return number == null ? repo : `${repo}#${number}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 5
    ? "Working late"
    : h < 12
      ? "Good morning"
      : h < 18
        ? "Good afternoon"
        : "Good evening";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** datetime-local input value ↔ ISO */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export function snoozeOptions(now = new Date()): { label: string; iso: string }[] {
  const at = (days: number, hour = 9) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const daysToMonday = (8 - now.getDay()) % 7 || 7;
  return [
    { label: "Later today (+3h)", iso: new Date(now.getTime() + 3 * 3_600_000).toISOString() },
    { label: "Tomorrow morning", iso: at(1) },
    { label: "In 3 days", iso: at(3) },
    { label: "Next Monday", iso: at(daysToMonday) },
    { label: "In 2 weeks", iso: at(14) },
  ];
}
