import type { PinItem } from "./types";

/** Items older than `days` that retention may remove. Pinned and favourite items are never expired. `days <= 0` keeps everything. */
export function expiredItems(items: PinItem[], days: number, now: number = Date.now()): PinItem[] {
  if (!(days > 0)) return [];
  const cutoff = now - days * 86_400_000;
  return items.filter((i) => !i.pinned && !i.favorite && i.capturedAt < cutoff);
}
