import type { PinItem, ItemKind } from "./types";
import type { Settings } from "./settings";
import { dedupeKey } from "./dedupe";

const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i;
export function classifyText(text: string): "url" | "text" { return URL_RE.test(text.trim()) ? "url" : "text"; }

export function titleFor(kind: ItemKind, content: string): string {
  const t = content.trim();
  if (kind === "url") { try { return new URL(t.startsWith("www.") ? `https://${t}` : t).hostname.replace(/^www\./, ""); } catch { return t.slice(0, 60); } }
  if (kind === "file" || kind === "folder") return t.split(/[\\/]/).filter(Boolean).pop() ?? t;
  if (kind === "group") return `${t.split("\n").length} files`;
  if (kind === "image") return "Image";
  return (t.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 60) || "Text";
}

/** Fast non-cryptographic hash (FNV-1a 64 via two 32-bit lanes). The Rust side uses SHA-256 for stored hashes. */
export function hashKey(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 0x01000193); b = Math.imul(b ^ s.charCodeAt(i), 0x85ebca6b); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export interface NewCapture { kind: ItemKind; content: string; sizeBytes?: number; sourceApp?: string; collectionId: string; title?: string }

export function allowed(kind: ItemKind, s: Settings, sourceApp?: string): boolean {
  const c = s.capture;
  if (!c.enabled) return false;
  if (sourceApp && s.excludedApps.some((e) => e.toLowerCase() === sourceApp.toLowerCase())) return false;
  return kind === "text" ? c.text : kind === "url" ? c.urls : kind === "image" ? c.images : kind === "folder" ? c.folders : c.files;
}

export interface CaptureResult { items: PinItem[]; item: PinItem; duplicate: boolean }

/** Insert a capture or, if identical content exists, bump it to the top instead of duplicating. Trims history to maxItems (pinned/favourites are never evicted). */
export function addCapture(items: PinItem[], c: NewCapture, maxItems: number, now = Date.now(), id: () => string = () => crypto.randomUUID()): CaptureResult {
  const key = dedupeKey(c.kind, c.content);
  const hash = hashKey(key);
  const existing = items.find((i) => i.hash === hash && dedupeKey(i.kind, i.content) === key);
  if (existing) {
    const item = { ...existing, capturedAt: now };
    return { items: items.map((i) => (i.id === existing.id ? item : i)), item, duplicate: true };
  }
  const item: PinItem = { id: id(), kind: c.kind, title: c.title ?? titleFor(c.kind, c.content), content: c.content, collectionId: c.collectionId,
    tags: [], pinned: false, favorite: false, capturedAt: now, sizeBytes: c.sizeBytes, sourceApp: c.sourceApp, hash };
  let next = [item, ...items];
  if (next.length > maxItems) {
    const evictable = next.filter((i) => !i.pinned && !i.favorite).sort((a, b) => a.capturedAt - b.capturedAt);
    const drop = new Set(evictable.slice(0, next.length - maxItems).map((i) => i.id));
    next = next.filter((i) => !drop.has(i.id));
  }
  return { items: next, item, duplicate: false };
}

export function formatSize(n?: number): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"]; let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
export function formatAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now"; if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`;
}
