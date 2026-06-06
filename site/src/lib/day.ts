/** Format a date (ISO or "YYYY-MM-DD") as a long weekday label, e.g. "Monday, Jun 1". */
export function dayLabel(date: string): string {
  const d = new Date(date.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}
/** Short weekday, e.g. "Mon". */
export function weekdayShort(date: string): string {
  const d = new Date(date.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
