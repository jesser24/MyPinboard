import { describe, it, expect } from "vitest";
import { rank, score, type Command } from "../src/lib/palette";
import { pruneSelection, rangeIds, toggleId } from "../src/lib/selection";
import { DEFAULT_SETTINGS, applySettings, mergeSettings } from "../src/lib/settings";

const cmd = (id: string, title: string, keywords = ""): Command => ({ id, title, group: "g", keywords, run: () => {} });
describe("palette ranking", () => {
  const cs = [cmd("a", "Open settings"), cmd("b", "Switch to dark theme", "appearance night"), cmd("c", "Go to Favourites"), cmd("d", "Pause capture", "stop")];
  it("prefers prefix over word start over substring", () => {
    expect(score("open", "Open settings")).toBeGreaterThan(score("sett", "Open settings")); expect(score("sett", "Open settings")).toBeGreaterThan(score("ttin", "Open settings"));
  });
  it("is accent and case insensitive", () => { expect(score("FAVOURITES", "Go to favourités")).toBeGreaterThan(0); });
  it("matches keywords and multiple tokens", () => {
    expect(rank(cs, "night").map((c) => c.id)).toEqual(["b"]); expect(rank(cs, "theme dark")[0].id).toBe("b");
  });
  it("returns everything in order for an empty query and nothing for gibberish", () => { expect(rank(cs, "").map((c) => c.id)).toEqual(["a", "b", "c", "d"]); expect(rank(cs, "zzzqq")).toEqual([]); });
  it("respects the limit", () => { expect(rank(cs, "", 2)).toHaveLength(2); });
});
describe("selection", () => {
  it("toggles without mutating", () => { const s = new Set(["a"]); const n = toggleId(s, "b"); expect([...s]).toEqual(["a"]); expect([...n].sort()).toEqual(["a", "b"]); expect(toggleId(n, "a").has("a")).toBe(false); });
  it("selects ranges in either direction and falls back to the target", () => {
    const o = ["a", "b", "c", "d", "e"]; expect(rangeIds(o, "b", "d")).toEqual(["b", "c", "d"]); expect(rangeIds(o, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeIds(o, undefined, "c")).toEqual(["c"]); expect(rangeIds(o, "zz", "c")).toEqual(["c"]); expect(rangeIds(o, "a", "nope")).toEqual([]);
  });
  it("prunes vanished ids and keeps identity when nothing changed", () => {
    const s = new Set(["a", "b"]); expect(pruneSelection(s, new Set(["a", "b", "c"]))).toBe(s); expect([...pruneSelection(s, new Set(["a"]))]).toEqual(["a"]);
  });
});
describe("settings normalisation", () => {
  it("fills new fields for settings stored by the previous version", () => {
    const old = { theme: "dark", accent: "azure", capture: { enabled: false }, shortcuts: [] }; const m = mergeSettings(old);
    expect(m.theme).toBe("dark"); expect(m.capture.enabled).toBe(false); expect(m.capture.text).toBe(true); expect(m.viewMode).toBe("list"); expect(m.handleThickness).toBe(10); expect(m.shortcuts).toEqual(DEFAULT_SETTINGS.shortcuts);
  });
  it("clamps handle size and rejects unknown accents and modes", () => {
    const m = mergeSettings({ accent: "neon", viewMode: "cube", rowDensity: "x", handleThickness: 99, handleLength: 1 }); expect([m.accent, m.viewMode, m.rowDensity, m.handleThickness, m.handleLength]).toEqual(["violet", "list", "comfortable", 12, 30]);
    expect(mergeSettings({ handleThickness: NaN }).handleThickness).toBe(10);
  });
  it("writes the handle and accent as CSS variables, never exceeding the 16 dip window on hover", () => {
    const root = document_like(); applySettings({ ...DEFAULT_SETTINGS, handleThickness: 12, handleLength: 60, accent: "mint" }, root as unknown as HTMLElement);
    expect(root.vars["--accent"]).toBe("#1fae83"); expect(root.vars["--handle-t"]).toBe("12px"); expect(root.vars["--handle-len"]).toBe("60%");
    expect(12 * Number(root.vars["--handle-grow"])).toBeLessThanOrEqual(16); expect(root.dataset.indicator).toBe("on");
    expect(root.vars["--tg-main"]).toBeUndefined(); expect(root.vars["--panel-r"]).toBe("20px"); expect(root.vars["--glass-alpha"]).toBe("0.75");
    applySettings({ ...DEFAULT_SETTINGS, toggleColor: "#ff8800", toggleGlowOn: false, panelRadius: 12, shadowIntensity: 0 }, root as unknown as HTMLElement);
    expect(root.vars["--tg-main"]).toBe("#ff8800"); expect(root.vars["--tg-glow-pct"]).toBe("0%"); expect(root.vars["--panel-r"]).toBe("12px"); expect(root.vars["--panel-shadow"]).toBe("none");
    applySettings({ ...DEFAULT_SETTINGS, animSpeed: 0, handleIndicator: false }, root as unknown as HTMLElement); expect(root.dataset.motion).toBe("off"); expect(root.dataset.indicator).toBe("off");
  });
});
function document_like() { const vars: Record<string, string> = {}; return { vars, dataset: {} as Record<string, string>, style: { setProperty: (k: string, v: string) => { vars[k] = v; }, removeProperty: (k: string) => { delete vars[k]; } } }; }
