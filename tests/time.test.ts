import { describe, expect, it } from "vitest";
import { formatCaptured, formatFull } from "../src/lib/time";

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 5).getTime();
const NOW = at(2026, 11, 8, 18, 0);

describe("formatCaptured", () => {
  it("says Today / Yesterday with the capture time, not the render time", () => {
    expect(formatCaptured(at(2026, 11, 8, 17, 24), NOW, "en-GB")).toBe("Today · 17:24");
    expect(formatCaptured(at(2026, 11, 7, 9, 15), NOW, "en-GB")).toBe("Yesterday · 09:15");
  });
  it("is stable: the same capture time gives the same text however much later it renders on the same day", () => {
    const ts = at(2026, 11, 8, 8, 2);
    expect(formatCaptured(ts, at(2026, 11, 8, 8, 3), "en-GB")).toBe(formatCaptured(ts, at(2026, 11, 8, 23, 59), "en-GB"));
  });
  it("uses month and day within the year, adds the year before that", () => {
    expect(formatCaptured(at(2026, 11, 5, 14, 32), NOW, "en-US")).toMatch(/^Nov 5 · 0?2:32 PM$/);
    expect(formatCaptured(at(2025, 10, 12, 11, 5), NOW, "en-US")).toMatch(/^Oct 12, 2025 · 11:05 AM$/);
  });
  it("is locale-aware", () => {
    expect(formatCaptured(at(2026, 11, 8, 17, 24), NOW, "fr-FR")).toMatch(/^Aujourd.hui · 17:24$/);
    expect(formatCaptured(at(2026, 11, 7, 9, 15), NOW, "fr-FR")).toBe("Hier · 09:15");
  });
  it("treats just-after-midnight correctly", () => {
    expect(formatCaptured(at(2026, 11, 7, 23, 59), at(2026, 11, 8, 0, 1), "en-GB")).toBe("Yesterday · 23:59");
  });
});
describe("formatFull", () => {
  it("includes weekday, date and seconds", () => { const f = formatFull(at(2026, 11, 8, 17, 24), "en-GB"); expect(f).toContain("Sunday"); expect(f).toContain("2026"); expect(f).toContain("17:24:05"); });
});
