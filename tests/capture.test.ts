import { describe, it, expect } from "vitest";
import { addCapture, classifyText, titleFor, allowed, formatSize, formatAgo, hashKey } from "../src/lib/capture";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { LocalBackend, DEFAULT_COLLECTIONS } from "../src/lib/api";

let n = 0; const id = () => `id${++n}`;
const cap = (content: string, kind: any = "text") => ({ kind, content, collectionId: "personal" });

describe("capture", () => {
  it("classifies URLs vs text", () => {
    expect(classifyText("https://example.com/a?b=1")).toBe("url");
    expect(classifyText("www.example.com")).toBe("url");
    expect(classifyText("see https://example.com")).toBe("text");
  });
  it("titles", () => {
    expect(titleFor("url", "https://www.example.com/x")).toBe("example.com");
    expect(titleFor("file", "C:\\Docs\\Report.pdf")).toBe("Report.pdf");
    expect(titleFor("text", "\n\n  hello world\nmore")).toBe("hello world");
  });
  it("bumps duplicates instead of inserting", () => {
    const a = addCapture([], cap("hello"), 10, 1, id);
    const b = addCapture(a.items, cap("hello\r\n"), 10, 99, id);
    expect(b.duplicate).toBe(true); expect(b.items).toHaveLength(1); expect(b.item.capturedAt).toBe(99);
  });
  it("same text but different kind is not a duplicate", () => {
    const a = addCapture([], cap("https://a.com", "url"), 10, 1, id);
    expect(addCapture(a.items, cap("https://a.com", "text"), 10, 2, id).items).toHaveLength(2);
  });
  it("enforces maxItems but never evicts pinned or favourite", () => {
    let items = addCapture([], cap("p"), 3, 1, id).items; items[0] = { ...items[0], pinned: true };
    items = addCapture(items, cap("f"), 3, 2, id).items; items[0] = { ...items[0], favorite: true };
    items = addCapture(items, cap("x"), 3, 3, id).items;
    items = addCapture(items, cap("y"), 3, 4, id).items;
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.content).sort()).toEqual(["f", "p", "y"]);
  });
  it("honours capture settings and excluded apps", () => {
    const s = { ...DEFAULT_SETTINGS, capture: { ...DEFAULT_SETTINGS.capture, images: false } };
    expect(allowed("image", s)).toBe(false);
    expect(allowed("text", s)).toBe(true);
    expect(allowed("text", s, "keepass.exe")).toBe(false);
    expect(allowed("text", { ...s, capture: { ...s.capture, enabled: false } })).toBe(false);
  });
  it("formatting", () => {
    expect(formatSize(512)).toBe("512 B"); expect(formatSize(1536)).toBe("1.5 KB"); expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatAgo(0, 10_000)).toBe("just now"); expect(formatAgo(0, 7_200_000)).toBe("2 h ago");
    expect(hashKey("a")).not.toBe(hashKey("b"));
  });
});

describe("LocalBackend persistence", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it("round-trips items, collections and settings", async () => {
    const st = mem(); const b1 = new LocalBackend(st);
    const snap = await b1.load();
    expect(snap.collections).toEqual(DEFAULT_COLLECTIONS);
    const it = addCapture([], cap("persist me"), 10, 5, id).item;
    await b1.upsertItem(it); await b1.saveSettings({ ...snap.settings, accent: "mint" });
    const b2 = new LocalBackend(st); const again = await b2.load();
    expect(again.items.map((i) => i.content)).toEqual(["persist me"]); expect(again.settings.accent).toBe("mint");
    await b2.removeItems([it.id]); expect((await new LocalBackend(st).load()).items).toEqual([]);
  });
  it("survives corrupted storage", async () => {
    const st = mem(); st.setItem("mypinboard.v1", "{not json");
    const s = await new LocalBackend(st).load();
    expect(s.items).toEqual([]); expect(s.settings.edge).toBe("right");
  });
});
