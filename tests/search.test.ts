import { describe, it, expect } from "vitest";
import { runQuery } from "../src/lib/search";
import type { PinItem, Query } from "../src/lib/types";

const mk = (o: Partial<PinItem>): PinItem => ({
  id: Math.random().toString(36), kind: "text", title: "t", content: "", collectionId: "personal",
  tags: [], pinned: false, favorite: false, capturedAt: 1, hash: "h", ...o });
const base: Query = { text: "", kinds: [], favoritesOnly: false, sort: "recent" };

describe("runQuery", () => {
  const items = [
    mk({ id: "a", title: "Quarterly report.pdf", kind: "file", content: "C:\\Docs\\Q3.pdf", capturedAt: 10, sizeBytes: 5000 }),
    mk({ id: "b", title: "Café menu", content: "crème brûlée", capturedAt: 30, favorite: true, tags: ["food"] }),
    mk({ id: "c", title: "snippet", kind: "text", content: "const x = 1", capturedAt: 20, pinned: true, collectionId: "dev" }),
  ];
  it("matches accent-insensitively and by every token", () => {
    expect(runQuery(items, { ...base, text: "creme brulee" }).map(i => i.id)).toEqual(["b"]);
    expect(runQuery(items, { ...base, text: "quarterly pdf" }).map(i => i.id)).toEqual(["a"]);
    expect(runQuery(items, { ...base, text: "quarterly zzz" })).toEqual([]);
  });
  it("filters by kind, collection, tag, favourites", () => {
    expect(runQuery(items, { ...base, kinds: ["file"] }).map(i => i.id)).toEqual(["a"]);
    expect(runQuery(items, { ...base, collectionId: "dev" }).map(i => i.id)).toEqual(["c"]);
    expect(runQuery(items, { ...base, tag: "food" }).map(i => i.id)).toEqual(["b"]);
    expect(runQuery(items, { ...base, favoritesOnly: true }).map(i => i.id)).toEqual(["b"]);
  });
  it("floats pinned items first, then sorts", () => {
    expect(runQuery(items, base).map(i => i.id)).toEqual(["c", "b", "a"]);
    expect(runQuery(items, { ...base, sort: "name" }).map(i => i.id)).toEqual(["c", "b", "a"]);
    expect(runQuery(items, { ...base, sort: "size", collectionId: undefined })[1].id).toBe("a");
  });
  it("does not mutate input", () => {
    const copy = [...items];
    runQuery(items, { ...base, sort: "name" });
    expect(items).toEqual(copy);
  });
});
