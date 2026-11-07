import type { PinItem } from "./types";

/** Canonical key. Mirrors src-tauri/src/hashing.rs normalisation (trim + CRLF->LF, lowercase file paths). */
export function dedupeKey(kind: PinItem["kind"], content: string): string {
  let c = content.replace(/\r\n/g, "\n").trim();
  if (kind === "file" || kind === "folder" || kind === "group") {
    c = c.split("\n").map((p) => p.trim().replace(/\//g, "\\").toLowerCase()).sort().join("\n");
  }
  return `${kind}:${c}`;
}

/** Returns the existing item with identical key, if any. */
export function findDuplicate(items: PinItem[], kind: PinItem["kind"], content: string): PinItem | undefined {
  const key = dedupeKey(kind, content);
  return items.find((i) => dedupeKey(i.kind, i.content) === key);
}
