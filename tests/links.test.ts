import { describe, it, expect } from "vitest";
import { fileInfo, looksLikeCode, previewLine, shortenPath, splitUrl } from "../src/lib/links";

describe("splitUrl", () => {
  it("separates domain and path without www or protocol", () => {
    expect(splitUrl("https://www.react.dev/learn?x=1")).toEqual({ domain: "react.dev", path: "/learn?x=1" });
    expect(splitUrl("www.example.org")).toEqual({ domain: "example.org", path: "" });
    expect(splitUrl("http://localhost:5173/")).toEqual({ domain: "localhost", path: "" });
  });
  it("never throws on junk", () => { expect(splitUrl("not a url at all").domain).toBeTruthy(); });
});
describe("looksLikeCode", () => {
  it("detects shell commands and source code", () => {
    for (const c of ["npm install motion", "git commit -m \"x\"", "$ ls -la", "const total = items.reduce((a, b) => a + b, 0);", "<div class=\"x\">hi</div>", "{\"a\": 1}", "function f(x) {\n  return x;\n}"]) expect(looksLikeCode(c), c).toBe(true);
  });
  it("leaves prose alone", () => {
    for (const c of ["Meeting notes: ship the glass UI on Friday", "Rappeler le client à 15h — devis n°2024-118", "ok", ""]) expect(looksLikeCode(c), c).toBe(false);
  });
});
describe("fileInfo", () => {
  it("handles Windows and POSIX paths", () => {
    expect(fileInfo("C:\\Docs\\Reports\\Q3 report.pdf")).toEqual({ name: "Q3 report.pdf", ext: "PDF", dir: "C:\\Docs\\Reports" });
    expect(fileInfo("/home/me/archive.tar.gz")).toEqual({ name: "archive.tar.gz", ext: "GZ", dir: "/home/me" });
  });
  it("has no extension for dotfiles, bare names and folders", () => {
    expect(fileInfo("C:\\x\\.gitignore").ext).toBe(""); expect(fileInfo("README").ext).toBe(""); expect(fileInfo("C:\\Users\\me\\Desktop\\").name).toBe("Desktop");
  });
});
describe("shortenPath", () => {
  it("keeps short paths and trims long ones from the left, keeping the end", () => {
    expect(shortenPath("C:\\a\\b")).toBe("C:\\a\\b");
    const s = shortenPath("C:\\Users\\someone\\Documents\\Projects\\Client\\Reports\\2026\\Q3", 32);
    expect(s.length).toBeLessThanOrEqual(34); expect(s.startsWith("C:\\…\\")).toBe(true); expect(s.endsWith("Q3")).toBe(true);
  });
});
describe("previewLine", () => {
  it("drops the title from the preview and collapses whitespace", () => { expect(previewLine("Title here\n\nsecond   line", "Title here")).toBe("second line"); });
  it("returns empty when it would repeat the title", () => { expect(previewLine("same", "same")).toBe(""); expect(previewLine("", "x")).toBe(""); });
  it("cuts long text at a word", () => { const p = previewLine("alpha " + "word ".repeat(100), "alpha", 40); expect(p.length).toBeLessThanOrEqual(41); expect(p.endsWith("…")).toBe(true); });
});
