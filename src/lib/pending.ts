import type { PinItem } from "./types";

type Timers = { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
const real: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as number) };

/**
 * Deletes that can still be undone. Items leave the UI immediately, but the backend (which also deletes image files) is only told after the
 * undo window has passed. Quitting inside the window keeps the item: the failure mode is "not deleted yet", never "lost".
 */
export class PendingDeletes {
  private groups = new Map<number, { items: PinItem[]; handle: unknown }>();
  private n = 0;
  constructor(private commit: (ids: string[]) => void, readonly windowMs = 6000, private timers: Timers = real) {}

  /** Stage items for deletion; returns a token for `undo`. The window slides: every new delete restarts it for all staged groups, so one Undo covers a burst of deletes. */
  stage(items: PinItem[]): number {
    const token = ++this.n;
    this.groups.set(token, { items, handle: undefined });
    for (const [t, g] of this.groups) { this.timers.clear(g.handle); g.handle = this.timers.set(() => this.finish(t), this.windowMs); }
    return token;
  }
  /** Take back everything still staged. */
  undoAll(): PinItem[] {
    const out: PinItem[] = [];
    for (const [t, g] of [...this.groups]) { this.timers.clear(g.handle); this.groups.delete(t); out.push(...g.items); }
    return out;
  }
  /** Take the items back. Null when the window already passed (or the token is unknown). */
  undo(token: number): PinItem[] | null {
    const g = this.groups.get(token); if (!g) return null;
    this.timers.clear(g.handle); this.groups.delete(token); return g.items;
  }
  private finish(token: number) { const g = this.groups.get(token); if (!g) return; this.groups.delete(token); this.commit(g.items.map((i) => i.id)); }
  /** Commit every staged delete now (window closing, page unload). */
  flush() { for (const t of [...this.groups.keys()]) { const g = this.groups.get(t)!; this.timers.clear(g.handle); this.finish(t); } }
  /** Ids waiting for the window to pass: a reload from the backend must not resurrect them. */
  ids(): Set<string> { const s = new Set<string>(); for (const g of this.groups.values()) for (const i of g.items) s.add(i.id); return s; }
}
