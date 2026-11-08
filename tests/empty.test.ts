import { describe, it, expect } from "vitest";
import { emptyFor } from "../src/lib/empty";
import type { Collection } from "../src/lib/types";

const cols: Collection[] = [{ id: "work", name: "Work", color: "#000" }];
const base = { section: "all" as const, collections: cols, hasItems: false, text: "", date: "any" as const, paused: false };

describe("empty states", () => {
  it("explains a fresh install and what to do", () => { const e = emptyFor(base); expect(e.title).toBe("Nothing copied yet"); expect(e.body).toMatch(/Ctrl\+V/); expect(e.action).toBeUndefined(); });
  it("offers to resume when capture is paused and the history is empty", () => { expect(emptyFor({ ...base, paused: true }).action).toEqual({ id: "resume", label: "Resume capture" }); });
  it("a search with no hits names the query and offers to clear it, even when paused", () => {
    const e = emptyFor({ ...base, text: "invoice", hasItems: true, paused: true }); expect(e.title).toContain("invoice"); expect(e.action?.id).toBe("clear-search");
  });
  it("shortens very long queries", () => { const t = emptyFor({ ...base, text: "x".repeat(80) }).title; expect(t).toContain("…"); expect(t).not.toContain("x".repeat(40)); });
  it("a date range with items elsewhere offers to widen it", () => { expect(emptyFor({ ...base, hasItems: true, date: "today" }).action?.id).toBe("clear-date"); });
  it("a date range on an empty history does not blame the date", () => { expect(emptyFor({ ...base, date: "today" }).title).toBe("Nothing copied yet"); });
  it("names the collection and explains how to fill it", () => { const e = emptyFor({ ...base, section: "c:work" }); expect(e.title).toBe("Work is empty"); expect(e.body).toMatch(/Drag/); });
  it("tells favourites and pinned apart, and says favourites are protected", () => {
    expect(emptyFor({ ...base, section: "favorites" }).body).toMatch(/never removed/); expect(emptyFor({ ...base, section: "pinned" }).title).toBe("Nothing pinned");
  });
  it("has copy for every type section", () => { for (const s of ["text", "links", "images", "files", "folders"] as const) expect(emptyFor({ ...base, section: s }).title).toMatch(/^No /); });
});
