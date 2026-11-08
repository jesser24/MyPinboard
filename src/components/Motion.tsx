import { createContext, useContext, useMemo, type ReactNode } from "react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";

/**
 * One place for motion. Principles: short, springy-but-not-bouncy, transform and opacity only, and every transition scales with the
 * user's animation setting (0 = none). `reducedMotion="user"` additionally honours the OS setting: transforms and layout animations are
 * dropped, opacity changes stay.
 */
const SpeedContext = createContext(1);

export function MotionRoot({ speed, children }: { speed: number; children: ReactNode }) {
  return (
    <SpeedContext.Provider value={speed}>
      <LazyMotion features={domMax} strict>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </LazyMotion>
    </SpeedContext.Provider>
  );
}

export interface Presets {
  /** Layout moves, the sliding nav pill, selection bar. Critically damped: settles without visible overshoot. */
  spring: object;
  /** Opacity-only changes. */
  fade: object;
  /** Popovers and dialogs entering or leaving. */
  pop: object;
}
const INSTANT = { duration: 0 };
export function useMotion(): Presets {
  const s = useContext(SpeedContext);
  return useMemo(() => s === 0 ? { spring: INSTANT, fade: INSTANT, pop: INSTANT } : {
    spring: { type: "spring", stiffness: 520 * s * s, damping: 42 * s, mass: 0.9 },
    fade: { duration: 0.14 / s, ease: [0.2, 0.8, 0.2, 1] },
    pop: { duration: 0.15 / s, ease: [0.2, 0.8, 0.2, 1] },
  }, [s]);
}

/** Entrance / exit used by every floating layer: a quick fade with a small scale from its anchor. */
export const popVariants = { hidden: { opacity: 0, scale: 0.97 }, shown: { opacity: 1, scale: 1 }, gone: { opacity: 0, scale: 0.97 } };
