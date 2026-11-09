import type { AnimationId } from "./settings";
import type { Edge } from "./types";

export const ANIMATIONS: { id: AnimationId; label: string; hint: string }[] = [
  { id: "fade-scale", label: "Fade & Scale", hint: "Fades in while growing slightly." },
  { id: "slide", label: "Slide In", hint: "Glides in from the screen edge." },
  { id: "spring", label: "Spring", hint: "A soft, barely-there overshoot." },
  { id: "blur", label: "Blur Reveal", hint: "Comes into focus." },
  { id: "expand", label: "Expand from Toggle", hint: "Grows out of the edge tab." },
  { id: "instant", label: "Instant", hint: "No movement at all." },
];
export const SPEEDS: { id: "fast" | "normal" | "slow"; label: string; ms: number }[] = [{ id: "fast", label: "Fast", ms: 180 }, { id: "normal", label: "Normal", ms: 280 }, { id: "slow", label: "Slow", ms: 480 }];
export const speedOf = (ms: number): "fast" | "normal" | "slow" | "custom" => SPEEDS.find((s) => s.ms === ms)?.id ?? "custom";

const DIR: Record<Edge, [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const ORIGIN: Record<Edge, string> = { left: "0% 50%", right: "100% 50%", top: "50% 0%", bottom: "50% 100%" };

export interface PanelAnim {
  closed: Record<string, number | string>;
  open: Record<string, number | string>;
  enter: object; leave: object; origin: string;
}

/**
 * The real opening/closing animation of the floating panel. `ms` is the opening duration; closing is always quicker (70 %).
 * `enabled = false` (animation switched off) yields an instant swap. Transform-based entries are dropped by the OS reduced-motion setting (see MotionRoot).
 */
export function panelAnimation(id: AnimationId, edge: Edge, ms: number, enabled = true): PanelAnim {
  const [dx, dy] = DIR[edge] ?? DIR.right;
  const dur = Math.max(0.05, ms / 1000);
  const ease = [0.2, 0.8, 0.2, 1];
  const tween = { duration: dur, ease };
  const leave = { duration: dur * 0.7, ease };
  const origin = ORIGIN[edge] ?? ORIGIN.right;
  const NONE = { x: 0, y: 0, scale: 1, opacity: 1, filter: "blur(0px)" };
  if (!enabled || id === "instant") return { closed: { opacity: 0, x: 0, y: 0, scale: 1, filter: "blur(0px)" }, open: NONE, enter: { duration: 0 }, leave: { duration: 0 }, origin };
  switch (id) {
    case "slide": return { closed: { opacity: 0, x: dx * 40, y: dy * 40, scale: 1, filter: "blur(0px)" }, open: NONE, enter: tween, leave, origin };
    case "spring": {
      const k = 280 / ms; // faster setting = stiffer spring, same damping ratio (~0.6: one small overshoot)
      return { closed: { opacity: 0, x: dx * 18, y: dy * 18, scale: 0.92, filter: "blur(0px)" }, open: NONE,
        enter: { type: "spring", stiffness: 420 * k * k, damping: 26 * k, mass: 1, opacity: { duration: dur * 0.5, ease } }, leave, origin };
    }
    case "blur": return { closed: { opacity: 0, x: 0, y: 0, scale: 0.985, filter: "blur(14px)" }, open: NONE, enter: tween, leave, origin: "50% 50%" };
    case "expand": return { closed: { opacity: 0, x: 0, y: 0, scale: 0.18, filter: "blur(0px)" }, open: NONE, enter: { ...tween, ease: [0.16, 1, 0.3, 1] }, leave, origin };
    default: return { closed: { opacity: 0, x: dx * 10, y: dy * 10, scale: 0.96, filter: "blur(0px)" }, open: NONE, enter: tween, leave, origin };
  }
}
