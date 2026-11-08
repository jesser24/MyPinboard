import { describe, expect, it } from "vitest";
import { expiredItems } from "../src/lib/retention";
import type { PinItem } from "../src/lib/types";

const DAY = 86_400_000; const NOW = 1_800_000_000_000;
const it_ = (id: string, ageDays: number, extra: Partial<PinItem> = {}) => ({ id, capturedAt: NOW - ageDays * DAY, pinned: false, favorite: false, ...extra } as PinItem);
describe("expiredItems", () => {
  it("keeps everything when retention is 0 (forever)", () => expect(expiredItems([it_("a", 999)], 0, NOW)).toEqual([]));
  it("expires only items older than the cutoff", () => expect(expiredItems([it_("old", 31), it_("new", 29)], 30, NOW).map((i) => i.id)).toEqual(["old"]));
  it("never expires pinned or favourite items", () => expect(expiredItems([it_("p", 400, { pinned: true }), it_("f", 400, { favorite: true }), it_("x", 400)], 30, NOW).map((i) => i.id)).toEqual(["x"]));
});
