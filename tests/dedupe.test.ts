import { describe, it, expect } from "vitest";
import type { PinItem } from "../src/lib/types";
import { dedupeKey, findDuplicate } from "../src/lib/dedupe";
import { findConflicts, normaliseKeys } from "../src/lib/shortcuts";

describe("dedupeKey", () => {
  it("ignores CRLF and surrounding whitespace for text", () => {
    expect(dedupeKey("text", " a\r\nb ")).toBe(dedupeKey("text", "a\nb"));
  });
  it("treats file paths case/slash-insensitively and order-independently", () => {
    expect(dedupeKey("group", "C:/A/x.txt\nC:/B/y.txt")).toBe(dedupeKey("group", "c:\\b\\y.txt\nc:\\a\\X.TXT"));
  });
  it("keeps kinds apart", () => {
    expect(dedupeKey("text", "http://a")).not.toBe(dedupeKey("url", "http://a"));
  });
  it("findDuplicate returns existing item", () => {
    const it1: PinItem = { id: "1", kind: "text", title: "", content: "hello", collectionId: "p", tags: [], pinned: false, favorite: false, capturedAt: 1, hash: "" };
    expect(findDuplicate([it1], "text", "hello\n")?.id).toBe("1");
    expect(findDuplicate([it1], "text", "other")).toBeUndefined();
  });
});

describe("shortcut conflicts", () => {
  it("normalises ordering", () => { expect(normaliseKeys("S+Alt+Win")).toBe("alt+win+s"); });
  it("detects conflicts regardless of order/case", () => {
    const c = findConflicts([{ action: "toggle", keys: "Win+Alt+S" }, { action: "x", keys: "alt+win+s" }, { action: "pause", keys: "Win+Alt+P" }]);
    expect(c).toHaveLength(1);
    expect(c[0].map(b => b.action)).toEqual(["toggle", "x"]);
  });
  it("no conflicts for defaults", () => {
    expect(findConflicts([{ action: "t", keys: "Win+Alt+S" }, { action: "p", keys: "Win+Alt+P" }, { action: "f", keys: "Ctrl+F" }])).toEqual([]);
  });
});
