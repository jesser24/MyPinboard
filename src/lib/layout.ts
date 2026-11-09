/** Adaptive board sizing. Pure functions: all inputs are logical (DIP) pixels. */
import type { Edge } from "./types";

export type Density = "compact" | "comfortable" | "spacious";
export interface Area { width: number; height: number }
export interface BoardSize { width: number; height: number }

export const MIN_BOARD = { width: 340, height: 360 };
export const MAX_BOARD = { width: 1280, height: 900 };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Board size for a work area. Side edges favour a tall panel, top/bottom a wide one.
 * Never exceeds 92% of the area on the cross axis so the handle and desktop stay reachable.
 */
export function boardSize(area: Area, edge: Edge): BoardSize {
  const vertical = edge === "left" || edge === "right";
  const w = vertical ? area.width * 0.30 : area.width * 0.62;
  const h = vertical ? area.height * 0.86 : area.height * 0.46;
  const size = {
    width: clamp(w, MIN_BOARD.width, MAX_BOARD.width),
    height: clamp(h, MIN_BOARD.height, MAX_BOARD.height),
  };
  // tiny screens: never larger than the area itself
  return {
    width: Math.min(size.width, Math.floor(area.width * 0.92)),
    height: Math.min(size.height, Math.floor(area.height * 0.92)),
  };
}

/** Orientation of the menu. The docked edge is the single source of truth: top/bottom = horizontal, left/right = vertical. */
export type Orientation = "horizontal" | "vertical";
export const orientationOf = (edge: Edge): Orientation => (edge === "top" || edge === "bottom" ? "horizontal" : "vertical");

/**
 * Floating-panel size for a docked edge. The stored width/height (320–480 × 380–700 dip) describe the vertical panel; on the top and bottom
 * edge the panel lies down, so the two swap. Never more than 92 % of the screen. Mirrors `Settings::panel_size_for` + `board_rect_sized` in the Rust core.
 */
export function panelSize(area: Area, edge: Edge, width: number, height: number): BoardSize {
  const w = clamp(Number.isFinite(width) ? width : 380, 320, 480), h = clamp(Number.isFinite(height) ? height : 540, 380, 700);
  const [pw, ph] = orientationOf(edge) === "horizontal" ? [h, w] : [w, h];
  return { width: Math.min(pw, Math.floor(area.width * 0.92)), height: Math.min(ph, Math.floor(area.height * 0.92)) };
}

export function density(board: BoardSize): Density {
  const shortSide = Math.min(board.width, board.height);
  if (shortSide < 480) return "compact";
  if (shortSide < 720) return "comfortable";
  return "spacious";
}

/** Card columns: card min width scales by density, gap is fixed per density. */
export function gridColumns(boardWidth: number, d: Density): number {
  const min = d === "compact" ? 140 : d === "comfortable" ? 168 : 200;
  const gap = d === "compact" ? 8 : d === "comfortable" ? 12 : 16;
  const inner = boardWidth - gap * 2;
  return Math.max(1, Math.floor((inner + gap) / (min + gap)));
}

/** Touch targets must be >= 44 dip when the primary input is coarse. */
export function minHitTarget(coarsePointer: boolean): number {
  return coarsePointer ? 44 : 28;
}

/** Fluid type scale: base px follows board width between 13 and 16. */
export function baseFontPx(boardWidth: number): number {
  return Math.round(clamp(13 + (boardWidth - 340) / 300, 13, 16) * 10) / 10;
}
