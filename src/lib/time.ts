/** Capture timestamps, formatted for people. Always derived from the stored capture time, never from "now" (except to pick Today / Yesterday). */

const cap = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** "Today · 17:24", "Yesterday · 09:15", "Nov 5 · 14:32", "Oct 12, 2025 · 11:05" (locale-aware; the clock follows the locale's 12/24 h habit). */
export function formatCaptured(ts: number, now: number = Date.now(), locale?: string | string[]): string {
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(ts);
  const diff = Math.round((dayStart(now) - dayStart(ts)) / 86_400_000);
  if (diff === 0 || diff === 1) {
    const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diff, "day");
    return `${cap(rel)} · ${time}`;
  }
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  const date = new Intl.DateTimeFormat(locale, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(ts);
  return `${date} · ${time}`;
}

/** Tooltip text: the complete timestamp, e.g. "Sunday, November 8, 2026 at 17:24:05". */
export function formatFull(ts: number, locale?: string | string[]): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "medium" }).format(ts);
}
