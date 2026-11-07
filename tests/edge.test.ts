import { describe, it, expect } from "vitest";
import { nearestEdge, offsetFor, handleRect, boardRect, recoverPlacement, HANDLE_VISIBLE, OFFSET_MIN, OFFSET_MAX } from "../src/lib/edge";
import { boardSize } from "../src/lib/layout";
import type { Edge } from "../src/lib/types";

const areas = [{ width: 1280, height: 720 }, { width: 1536, height: 864 }, { width: 2560, height: 1440 }, { width: 3440, height: 1440 }, { width: 1080, height: 1920 }];
const edges: Edge[] = ["top", "bottom", "left", "right"];
const inside = (r: { x: number; y: number; w: number; h: number }, a: { width: number; height: number }) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= a.width + 1e-6 && r.y + r.h <= a.height + 1e-6;

describe("edge geometry", () => {
  it("nearestEdge picks the closest edge", () => {
    const a = { width: 1000, height: 600 };
    expect(nearestEdge({ x: 10, y: 300 }, a)).toBe("left");
    expect(nearestEdge({ x: 990, y: 300 }, a)).toBe("right");
    expect(nearestEdge({ x: 500, y: 5 }, a)).toBe("top");
    expect(nearestEdge({ x: 500, y: 595 }, a)).toBe("bottom");
  });
  it("offset is clamped away from corners", () => {
    const a = { width: 1000, height: 600 };
    expect(offsetFor("left", { x: 0, y: 0 }, a)).toBe(OFFSET_MIN);
    expect(offsetFor("top", { x: 1000, y: 0 }, a)).toBe(OFFSET_MAX);
  });
  for (const a of areas) for (const e of edges) for (const o of [0, 0.3, 0.5, 1]) {
    it(`handle stays visible and on screen: ${e} ${o} @${a.width}x${a.height}`, () => {
      const r = handleRect(e, o, a);
      expect(inside(r, a)).toBe(true);
      expect(Math.min(r.w, r.h)).toBe(HANDLE_VISIBLE);
    });
    it(`board stays fully on screen: ${e} ${o} @${a.width}x${a.height}`, () => {
      const r = boardRect(e, o, a, boardSize(a, e));
      expect(inside(r, a)).toBe(true);
      expect(r.w).toBeGreaterThan(0); expect(r.h).toBeGreaterThan(0);
    });
  }
  it("board never overlaps its own handle", () => {
    for (const a of areas) for (const e of edges) {
      const h = handleRect(e, 0.5, a), b = boardRect(e, 0.5, a, boardSize(a, e));
      const overlap = h.x < b.x + b.w && h.x + h.w > b.x && h.y < b.y + b.h && h.y + h.h > b.y;
      expect(overlap).toBe(false);
    }
  });
  it("recoverPlacement rehomes on invalid area", () => {
    expect(recoverPlacement("left", 0.4, { width: 0, height: 0 })).toEqual({ edge: "right", offset: 0.5 });
    expect(recoverPlacement("left", 5, { width: 800, height: 600 })).toEqual({ edge: "left", offset: OFFSET_MAX });
  });
});
