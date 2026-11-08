/** Command palette ranking. Pure: the UI supplies the commands, this decides order. */

export interface Command {
  id: string;
  title: string;
  /** Grouping heading shown in the palette. */
  group: string;
  /** Extra words that should also match (synonyms). */
  keywords?: string;
  /** Right-aligned shortcut hint, display only. */
  shortcut?: string;
  /** Greyed secondary text, e.g. the current value. */
  hint?: string;
  run: () => void;
}

const norm = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** 0 = no match. Prefix > word start > substring > loose in-order letters. */
export function score(query: string, text: string): number {
  const q = norm(query).trim(); if (!q) return 1;
  const t = norm(text);
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - Math.min(t.length - q.length, 100);
  const words = t.split(/[^a-z0-9]+/); if (words.some((w) => w.startsWith(q))) return 600 - Math.min(t.indexOf(q), 100);
  const at = t.indexOf(q); if (at >= 0) return 400 - Math.min(at, 100);
  // every token must match somewhere (order independent), e.g. "theme dark"
  const toks = q.split(/\s+/); if (toks.length > 1 && toks.every((k) => t.includes(k))) return 300;
  let i = 0; for (const ch of t) if (ch === q[i]) i++;
  return i === q.length && q.length >= 3 ? 100 : 0;
}

export function rank(commands: Command[], query: string, limit = 30): Command[] {
  if (!query.trim()) return commands.slice(0, limit);
  return commands
    .map((c, n) => ({ c, n, s: Math.max(score(query, c.title), score(query, `${c.title} ${c.keywords ?? ""}`) * 0.8) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.n - b.n).slice(0, limit).map((x) => x.c);
}
