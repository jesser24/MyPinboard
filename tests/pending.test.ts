import { describe, expect, it } from "vitest";
import { PendingDeletes } from "../src/lib/pending";
import type { PinItem } from "../src/lib/types";

const item = (id: string) => ({ id } as PinItem);
function harness() {
  const committed: string[][] = []; const jobs = new Map<number, () => void>(); let n = 0;
  const timers = { set: (fn: () => void) => { jobs.set(++n, fn); return n; }, clear: (h: unknown) => { jobs.delete(h as number); } };
  const p = new PendingDeletes((ids) => committed.push(ids), 6000, timers);
  return { p, committed, fire: () => { for (const [k, f] of [...jobs]) { jobs.delete(k); f(); } } };
}
describe("PendingDeletes", () => {
  it("does not touch the backend until the window passes", () => { const h = harness(); h.p.stage([item("a")]); expect(h.committed).toEqual([]); h.fire(); expect(h.committed).toEqual([["a"]]); });
  it("undo returns the items and cancels the backend delete", () => { const h = harness(); const t = h.p.stage([item("a"), item("b")]); expect(h.p.undo(t)?.map((i) => i.id)).toEqual(["a", "b"]); h.fire(); expect(h.committed).toEqual([]); });
  it("undo after the window is a no-op", () => { const h = harness(); const t = h.p.stage([item("a")]); h.fire(); expect(h.p.undo(t)).toBeNull(); });
  it("reports ids still waiting, so a reload cannot resurrect them", () => { const h = harness(); h.p.stage([item("a")]); h.p.stage([item("b")]); expect([...h.p.ids()].sort()).toEqual(["a", "b"]); h.fire(); expect(h.p.ids().size).toBe(0); });
  it("flush commits everything immediately", () => { const h = harness(); h.p.stage([item("a")]); h.p.stage([item("b")]); h.p.flush(); expect(h.committed).toEqual([["a"], ["b"]]); h.fire(); expect(h.committed.length).toBe(2); });
  it("two deletes undo independently", () => { const h = harness(); const a = h.p.stage([item("a")]); h.p.stage([item("b")]); h.p.undo(a); h.fire(); expect(h.committed).toEqual([["b"]]); });
  it("undoAll restores a whole burst of deletes", () => { const h = harness(); h.p.stage([item("a")]); h.p.stage([item("b"), item("c")]); expect(h.p.undoAll().map((i) => i.id)).toEqual(["a", "b", "c"]); h.fire(); expect(h.committed).toEqual([]); expect(h.p.ids().size).toBe(0); });
  it("a new delete restarts the window of earlier ones (sliding window)", () => {
    const jobs: { id: number; fn: () => void; live: boolean }[] = []; const committed: string[][] = [];
    const p = new PendingDeletes((ids) => committed.push(ids), 6000, { set: (fn) => { jobs.push({ id: jobs.length, fn, live: true }); return jobs.length - 1; }, clear: (h) => { if (jobs[h as number]) jobs[h as number].live = false; } });
    p.stage([item("a")]); p.stage([item("b")]);
    expect(jobs.filter((j) => j.live).length).toBe(2); // old timer for "a" was replaced, not left running
    expect(jobs[0].live).toBe(false);
  });
});
