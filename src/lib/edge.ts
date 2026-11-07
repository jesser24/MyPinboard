/** Geometry of the edge handle and the docked board. Pure, logical (DIP) pixels. */
import type { Edge } from "./types";
import type { Area, BoardSize } from "./layout";

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const HANDLE_VISIBLE = 10; // px of the tab that stays on screen
export const HANDLE_LENGTH = 72;
export const OFFSET_MIN = 0.1;
export const OFFSET_MAX = 0.9;
export const BOARD_MARGIN = 12;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
export const clampOffset = (o: number) => clamp(o, OFFSET_MIN, OFFSET_MAX);

export function nearestEdge(p: Pt, a: Area): Edge {
  const d: [Edge, number][] = [["left", p.x], ["right", a.width - p.x], ["top", p.y], ["bottom", a.height - p.y]];
  return d.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
}

/** Position along the edge (0..1), clamped so the tab never reaches a corner. */
export function offsetFor(edge: Edge, p: Pt, a: Area): number {
  return clampOffset(edge === "left" || edge === "right" ? p.y / a.height : p.x / a.width);
}

/** The handle tab: always fully inside the area, flush with its edge. */
export function handleRect(edge: Edge, offset: number, a: Area): Rect {
  const o = clampOffset(offset);
  switch (edge) {
    case "left": return { x: 0, y: o * a.height - HANDLE_LENGTH / 2, w: HANDLE_VISIBLE, h: HANDLE_LENGTH };
    case "right": return { x: a.width - HANDLE_VISIBLE, y: o * a.height - HANDLE_LENGTH / 2, w: HANDLE_VISIBLE, h: HANDLE_LENGTH };
    case "top": return { x: o * a.width - HANDLE_LENGTH / 2, y: 0, w: HANDLE_LENGTH, h: HANDLE_VISIBLE };
    case "bottom": return { x: o * a.width - HANDLE_LENGTH / 2, y: a.height - HANDLE_VISIBLE, w: HANDLE_LENGTH, h: HANDLE_VISIBLE };
  }
}

/** Board docked to an edge, centred on the handle, kept fully on screen. */
export function boardRect(edge: Edge, offset: number, a: Area, s: BoardSize): Rect {
  const o = clampOffset(offset);
  const m = BOARD_MARGIN;
  const w = Math.min(s.width, a.width - 2 * m);
  const h = Math.min(s.height, a.height - 2 * m);
  const cx = clamp(o * a.width - w / 2, m, a.width - w - m);
  const cy = clamp(o * a.height - h / 2, m, a.height - h - m);
  switch (edge) {
    case "left": return { x: m + HANDLE_VISIBLE, y: cy, w, h };
    case "right": return { x: a.width - w - m - HANDLE_VISIBLE, y: cy, w, h };
    case "top": return { x: cx, y: m + HANDLE_VISIBLE, w, h };
    case "bottom": return { x: cx, y: a.height - h - m - HANDLE_VISIBLE, w, h };
  }
}

/** Re-home a saved placement when the monitor shrank or went away. */
export function recoverPlacement(edge: Edge, offset: number, a: Area): { edge: Edge; offset: number } {
  const ok = a.width > 0 && a.height > 0 && Number.isFinite(offset);
  return ok ? { edge, offset: clampOffset(offset) } : { edge: "right", offset: 0.5 };
}
