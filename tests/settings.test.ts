import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, normalizeHex, PANEL_LIMITS } from "../src/lib/settings";
import { panelAnimation, ANIMATIONS } from "../src/lib/panelAnim";

describe("mergeSettings (floating panel)", () => {
  it("defaults: 380×540 panel, 75 % surface, fade & scale", () => {
    const s = mergeSettings({});
    expect(s.panelWidth).toBe(380); expect(s.panelHeight).toBe(540); expect(s.transparency).toBe(0.75); expect(s.panelRadius).toBe(20); expect(s.animation).toBe("fade-scale");
  });
  it("migrates the untouched legacy 72 % default to 75 %, but keeps other choices", () => {
    expect(mergeSettings({ transparency: 0.72 }).transparency).toBe(0.75);
    expect(mergeSettings({ transparency: 0.6 }).transparency).toBe(0.6);
    expect(mergeSettings({ transparency: 0.9 }).transparency).toBe(0.9);
  });
  it("clamps panel size to the specified limits", () => {
    const s = mergeSettings({ panelWidth: 9999, panelHeight: 10 });
    expect(s.panelWidth).toBe(PANEL_LIMITS.maxW); expect(s.panelHeight).toBe(PANEL_LIMITS.minH);
  });
  it("drops invalid colours and unknown enum values", () => {
    const s = mergeSettings({ toggleColor: "red", toggleGlow: "#ABCDEF", material: "plasma", animation: "wobble" } as never);
    expect(s.toggleColor).toBe(""); expect(s.toggleGlow).toBe("#abcdef"); expect(s.material).toBe("auto"); expect(s.animation).toBe("fade-scale");
  });
  it("old settings files (no new fields) load with all defaults", () => {
    const old = { theme: "dark", accent: "azure", transparency: 0.5, maxItems: 100 };
    const s = mergeSettings(old);
    expect(s.theme).toBe("dark"); expect(s.maxItems).toBe(100); expect(s.toggleGlowOn).toBe(DEFAULT_SETTINGS.toggleGlowOn); expect(s.retentionDays).toBe(0);
  });
});
describe("normalizeHex", () => {
  it("accepts 3 and 6 digit forms with or without #", () => { expect(normalizeHex("#ABC")).toBe("#aabbcc"); expect(normalizeHex("12ab34")).toBe("#12ab34"); expect(normalizeHex(" #7b6cf6 ")).toBe("#7b6cf6"); });
  it("rejects garbage", () => { expect(normalizeHex("")).toBeNull(); expect(normalizeHex("#12")).toBeNull(); expect(normalizeHex("zzzzzz")).toBeNull(); });
});
describe("panelAnimation", () => {
  it("has the six required animations", () => expect(ANIMATIONS.map((a) => a.id)).toEqual(["fade-scale", "slide", "spring", "blur", "expand", "instant"]));
  it("slides in from the docked edge", () => {
    expect(panelAnimation("slide", "right", 280).closed.x).toBeGreaterThan(0); expect(panelAnimation("slide", "left", 280).closed.x).toBeLessThan(0);
    expect(panelAnimation("slide", "top", 280).closed.y).toBeLessThan(0); expect(panelAnimation("slide", "bottom", 280).closed.y).toBeGreaterThan(0);
  });
  it("expand grows from the toggle's edge", () => { const a = panelAnimation("expand", "right", 280); expect(a.closed.scale).toBeLessThan(0.3); expect(a.origin).toBe("100% 50%"); });
  it("blur reveal animates a real blur", () => { expect(panelAnimation("blur", "right", 280).closed.filter).toContain("blur(14px)"); });
  it("instant and disabled have zero duration", () => {
    expect((panelAnimation("instant", "right", 280).enter as { duration: number }).duration).toBe(0);
    expect((panelAnimation("spring", "right", 280, false).enter as { duration: number }).duration).toBe(0);
  });
  it("closing is quicker than opening and spring keeps one small overshoot (damping ratio < 1)", () => {
    const a = panelAnimation("fade-scale", "right", 400); expect((a.leave as { duration: number }).duration).toBeLessThan((a.enter as { duration: number }).duration);
    const sp = panelAnimation("spring", "right", 280).enter as { stiffness: number; damping: number; mass: number };
    expect(sp.damping / (2 * Math.sqrt(sp.stiffness * sp.mass))).toBeLessThan(1);
  });
});

import { closeMs, motionSpeed } from "../src/lib/settings";
import { panelSize } from "../src/lib/layout";
describe("motion helpers", () => {
  it("motionSpeed: off stays off, shorter durations speed small animations up", () => {
    expect(motionSpeed({ animSpeed: 0, animDuration: 280 })).toBe(0);
    expect(motionSpeed({ animSpeed: 1, animDuration: 280 })).toBe(1);
    expect(motionSpeed({ animSpeed: 1, animDuration: 140 })).toBe(2);
    expect(motionSpeed({ animSpeed: 1, animDuration: 800 })).toBeCloseTo(0.4);
  });
  it("closeMs waits for the closing animation, and is 0 when animation is off", () => { expect(closeMs({ animSpeed: 0, animDuration: 400 })).toBe(0); expect(closeMs({ animSpeed: 1, animDuration: 400 })).toBe(320); });
});
describe("panelSize", () => {
  it("uses the requested size inside the 320–480 × 380–700 limits", () => {
    expect(panelSize({ width: 1920, height: 1080 }, 380, 540)).toEqual({ width: 380, height: 540 });
    expect(panelSize({ width: 1920, height: 1080 }, 9999, 1)).toEqual({ width: 480, height: 380 });
  });
  it("never exceeds the screen (92 %)", () => {
    expect(panelSize({ width: 360, height: 640 }, 480, 700)).toEqual({ width: 331, height: 588 });
    expect(panelSize({ width: 1280, height: 600 }, 380, 540)).toEqual({ width: 380, height: 540 });
  });
  it("falls back to the defaults for garbage input", () => expect(panelSize({ width: 1920, height: 1080 }, NaN, NaN)).toEqual({ width: 380, height: 540 }));
});
