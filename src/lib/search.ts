import type { PinItem, Query } from "./types";

const norm = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

export function matches(item: PinItem, q: Query): boolean {
  if (q.kinds.length && !q.kinds.includes(item.kind)) return false;
  if (q.collectionId && item.collectionId !== q.collectionId) return false;
  if (q.favoritesOnly && !item.favorite) return false;
  if (q.tag && !item.tags.includes(q.tag)) return false;
  const needle = norm(q.text.trim());
  if (!needle) return true;
  const hay = norm([item.title, item.content, item.tags.join(" "), item.sourceApp ?? ""].join("\n"));
  return needle.split(/\s+/).every((tok) => hay.includes(tok));
}

export function runQuery(items: PinItem[], q: Query): PinItem[] {
  const out = items.filter((i) => matches(i, q));
  const cmp: Record<Query["sort"], (a: PinItem, b: PinItem) => number> = {
    recent: (a, b) => b.capturedAt - a.capturedAt,
    name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    size: (a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0),
    type: (a, b) => a.kind.localeCompare(b.kind) || b.capturedAt - a.capturedAt,
  };
  // pinned always float to the top, then chosen sort
  return out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || cmp[q.sort](a, b));
}
