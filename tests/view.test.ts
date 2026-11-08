import { describe, it, expect } from "vitest";
import { collectionOf, collectionSection, groupItems, queryFor, sectionCounts, sectionTitle, sinceFor } from "../src/lib/view";
import { runQuery } from "../src/lib/search";
import type { Collection, PinItem } from "../src/lib/types";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 7, 15, 30).getTime(); // 7 Nov 2026, 15:30 local
const mk = (o: Partial<PinItem>): PinItem => ({ id: Math.random().toString(36), kind: "text", title: "t", content: "", collectionId: "personal", tags: [], pinned: false, favorite: false, capturedAt: NOW, hash: "h", ...o });
const cols: Collection[] = [{ id: "personal", name: "Personal", color: "#fff" }, { id: "work", name: "Work", color: "#000" }];

describe("sections and queries", () => {
  it("maps collection sections both ways", () => { expect(collectionOf(collectionSection("work"))).toBe("work"); expect(collectionOf("all")).toBeUndefined(); });
  it("titles every section, including a deleted collection", () => {
    expect(sectionTitle("favorites", cols)).toBe("Favourites"); expect(sectionTitle("c:work", cols)).toBe("Work"); expect(sectionTitle("c:gone", cols)).toBe("Collection");
  });
  it("builds queries for types, favourites, pinned and collections", () => {
    expect(queryFor({ section: "files", text: "", date: "any", sort: "recent" }).kinds).toEqual(["file", "group"]);
    expect(queryFor({ section: "links", text: "", date: "any", sort: "recent" }).kinds).toEqual(["url"]);
    expect(queryFor({ section: "favorites", text: "", date: "any", sort: "recent" }).favoritesOnly).toBe(true);
    expect(queryFor({ section: "pinned", text: "", date: "any", sort: "recent" }).pinnedOnly).toBe(true);
    expect(queryFor({ section: "c:work", text: "x", date: "any", sort: "name" }).collectionId).toBe("work");
    expect(queryFor({ section: "all", text: "", date: "any", sort: "recent" }).kinds).toEqual([]);
  });
  it("date ranges start at local midnight", () => {
    const t0 = new Date(2026, 10, 7).getTime();
    expect(sinceFor("any", NOW)).toBeUndefined(); expect(sinceFor("today", NOW)).toBe(t0);
    expect(sinceFor("week", NOW)).toBe(t0 - 6 * DAY); expect(sinceFor("month", NOW)).toBe(t0 - 29 * DAY);
  });
  it("counts each section independently of text filters", () => {
    const items = [mk({ favorite: true }), mk({ pinned: true, kind: "url" }), mk({ kind: "group", collectionId: "work" }), mk({ kind: "folder", collectionId: "work" }), mk({ kind: "image" })];
    expect(sectionCounts(items, cols)).toMatchObject({ all: 5, favorites: 1, pinned: 1, text: 1, links: 1, images: 1, files: 1, folders: 1, "c:personal": 3, "c:work": 2 });
  });
});

describe("search extras", () => {
  const items = [mk({ id: "a", collectionId: "work", title: "alpha" }), mk({ id: "b", collectionId: "personal", title: "beta", capturedAt: NOW - 10 * DAY, pinned: true })];
  const names = new Map(cols.map((c) => [c.id, c.name]));
  const q = (o: object) => ({ text: "", kinds: [], favoritesOnly: false, sort: "recent" as const, ...o });
  it("finds items by the name of their collection", () => { expect(runQuery(items, q({ text: "work" }), names).map((i) => i.id)).toEqual(["a"]); expect(runQuery(items, q({ text: "work" }))).toEqual([]); });
  it("filters by pinned and by date", () => {
    expect(runQuery(items, q({ pinnedOnly: true })).map((i) => i.id)).toEqual(["b"]);
    expect(runQuery(items, q({ since: sinceFor("week", NOW) })).map((i) => i.id)).toEqual(["a"]);
  });
  it("searches file names and URLs through the content", () => {
    const f = mk({ id: "f", kind: "file", title: "Q3.pdf", content: "C:\\Docs\\Reports\\Q3.pdf" }); const u = mk({ id: "u", kind: "url", content: "https://v2.tauri.app/start" });
    expect(runQuery([f, u], q({ text: "reports" })).map((i) => i.id)).toEqual(["f"]); expect(runQuery([f, u], q({ text: "tauri" })).map((i) => i.id)).toEqual(["u"]);
  });
});

describe("groupItems", () => {
  const at = (id: string, ms: number, o: Partial<PinItem> = {}) => mk({ id, capturedAt: ms, ...o });
  it("puts pinned first, then groups by day for the recent sort", () => {
    const g = groupItems([at("p", NOW - 30 * DAY, { pinned: true }), at("a", NOW - 1000), at("b", NOW - DAY), at("c", NOW - 3 * DAY), at("d", NOW - 20 * DAY)], "recent", NOW);
    expect(g.map((x) => x.label)).toEqual(["Pinned", "Today", "Yesterday", "This week", "Earlier"]); expect(g.map((x) => x.items[0].id)).toEqual(["p", "a", "b", "c", "d"]);
  });
  it("keeps a flat list for other sorts and omits empty headings", () => {
    expect(groupItems([at("a", NOW), at("b", NOW)], "name", NOW)).toEqual([{ key: "rest", label: "", items: expect.any(Array) }]);
    expect(groupItems([at("p", NOW, { pinned: true }), at("a", NOW)], "size", NOW).map((x) => x.label)).toEqual(["Pinned", "Everything else"]);
    expect(groupItems([], "recent", NOW)).toEqual([]);
  });
});
