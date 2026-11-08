/** Multi-selection helpers. Selections are plain id sets; the visible order decides ranges. */

export function toggleId(sel: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(sel); if (next.has(id)) next.delete(id); else next.add(id); return next;
}

/** Ids between `from` and `to` (inclusive, either direction) in the given visible order. Falls back to just `to` when `from` is not visible. */
export function rangeIds(order: readonly string[], from: string | undefined, to: string): string[] {
  const a = from === undefined ? -1 : order.indexOf(from); const b = order.indexOf(to);
  if (b < 0) return []; if (a < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** Drop ids that no longer exist (deleted, filtered by a data reload). Returns the same instance when nothing changed. */
export function pruneSelection(sel: ReadonlySet<string>, existing: ReadonlySet<string>): ReadonlySet<string> {
  let changed = false; const next = new Set<string>();
  for (const id of sel) { if (existing.has(id)) next.add(id); else changed = true; }
  return changed ? next : sel;
}
