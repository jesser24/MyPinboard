import { describe, it, expect } from "vitest";
import { boardSize, density, gridColumns, baseFontPx, minHitTarget, MIN_BOARD, MAX_BOARD } from "../src/lib/layout";

// Work areas (logical px) for the resolution matrix: physical / scale
const matrix: [string, number, number][] = [
  ["1280x720@100", 1280, 720], ["1366x768@100", 1366, 768], ["1920x1080@100", 1920, 1080],
  ["1920x1080@150", 1280, 720], ["2560x1440@100", 2560, 1440], ["3840x2160@150", 2560, 1440],
  ["3840x2160@250", 1536, 864], ["3440x1440 ultrawide@100", 3440, 1440], ["1080x1920 portrait@100", 1080, 1920],
];

describe("boardSize", () => {
  for (const edge of ["left", "right", "top", "bottom"] as const)
    for (const [name, w, h] of matrix)
      it(`${edge} @ ${name} stays within bounds and on screen`, () => {
        const s = boardSize({ width: w, height: h }, edge);
        expect(s.width).toBeLessThanOrEqual(w * 0.92 + 1);
        expect(s.height).toBeLessThanOrEqual(h * 0.92 + 1);
        expect(s.width).toBeLessThanOrEqual(MAX_BOARD.width);
        expect(s.height).toBeLessThanOrEqual(MAX_BOARD.height);
        expect(s.width).toBeGreaterThanOrEqual(Math.min(MIN_BOARD.width, w * 0.92));
      });
  it("side edges are taller than wide on landscape displays", () => {
    const s = boardSize({ width: 1920, height: 1080 }, "right");
    expect(s.height).toBeGreaterThan(s.width);
  });
  it("top/bottom edges are wider than tall on landscape displays", () => {
    const s = boardSize({ width: 1920, height: 1080 }, "top");
    expect(s.width).toBeGreaterThan(s.height);
  });
});

describe("density and grid", () => {
  it("simplifies on small boards", () => {
    expect(density({ width: 340, height: 400 })).toBe("compact");
    expect(density({ width: 1200, height: 800 })).toBe("spacious");
  });
  it("never yields fewer than one column and never overflows", () => {
    for (let w = 200; w <= 1280; w += 20)
      for (const d of ["compact", "comfortable", "spacious"] as const) {
        const cols = gridColumns(w, d);
        expect(cols).toBeGreaterThanOrEqual(1);
      }
  });
  it("uses extra space on large boards", () => {
    expect(gridColumns(1200, "spacious")).toBeGreaterThan(gridColumns(400, "compact"));
  });
});

describe("fluid helpers", () => {
  it("font size is clamped 13..16", () => {
    expect(baseFontPx(100)).toBe(13);
    expect(baseFontPx(5000)).toBe(16);
  });
  it("touch targets reach 44", () => {
    expect(minHitTarget(true)).toBe(44);
    expect(minHitTarget(false)).toBeLessThan(44);
  });
});
