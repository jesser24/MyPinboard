/** Backend contract. LocalBackend (browser storage) is used for dev and tests; the Tauri/SQLite backend implements the same interface. */
import type { PinItem, Collection } from "./types";
import { mergeSettings, type Settings } from "./settings";

export interface Snapshot { items: PinItem[]; collections: Collection[]; settings: Settings }
export interface Backend {
  load(): Promise<Snapshot>;
  upsertItem(i: PinItem): Promise<void>;
  removeItems(ids: string[]): Promise<void>;
  saveCollections(c: Collection[]): Promise<void>;
  /** Native backend returns warnings (e.g. a global shortcut another app already owns). */
  saveSettings(s: Settings): Promise<void | string[]>;
  restore(s: Snapshot): Promise<void>;
  copyItem(i: PinItem): Promise<void>;
  /** Open original / reveal in Explorer. Only meaningful natively. */
  openItem(i: PinItem): Promise<boolean>;
  revealItem(i: PinItem): Promise<boolean>;
  /** Native only: ingest the current Windows clipboard (Ctrl+V in the board, manual-capture shortcut). */
  captureClipboard?(): Promise<unknown>;
  /** Native only: the Rust side captured something (clipboard, drop). */
  subscribe?(cb: (e: { id: string; duplicate: boolean; origin: string }) => void): Promise<() => void>;
}

export const DEFAULT_COLLECTIONS: Collection[] = [
  { id: "personal", name: "Personal", color: "#8b6cf7" }, { id: "studies", name: "Studies", color: "#38bdf8" },
  { id: "development", name: "Development", color: "#34d399" }, { id: "work", name: "Work", color: "#f59e0b" },
  { id: "temporary", name: "Temporary", color: "#94a3b8" },
];

const K = "mypinboard.v1";
export class LocalBackend implements Backend {
  private snap: Snapshot | null = null;
  constructor(private store: Pick<Storage, "getItem" | "setItem"> = localStorage) {}
  private flush() { try { this.store.setItem(K, JSON.stringify(this.snap)); } catch { /* quota: keep in memory */ } }
  async load(): Promise<Snapshot> {
    let raw: Partial<Snapshot> = {};
    try { raw = JSON.parse(this.store.getItem(K) ?? "{}"); } catch { /* corrupted -> defaults */ }
    this.snap = {
      items: Array.isArray(raw.items) ? raw.items : [],
      collections: Array.isArray(raw.collections) && raw.collections.length ? raw.collections : DEFAULT_COLLECTIONS,
      settings: mergeSettings(raw.settings),
    };
    return structuredClone(this.snap);
  }
  private s(): Snapshot { if (!this.snap) throw new Error("load() first"); return this.snap; }
  async upsertItem(i: PinItem) { const s = this.s(); const n = s.items.findIndex((x) => x.id === i.id); n >= 0 ? (s.items[n] = i) : s.items.unshift(i); this.flush(); }
  async removeItems(ids: string[]) { const s = this.s(); s.items = s.items.filter((i) => !ids.includes(i.id)); this.flush(); }
  async saveCollections(c: Collection[]) { this.s().collections = c; this.flush(); }
  async saveSettings(st: Settings) { this.s().settings = st; this.flush(); }
  async restore(n: Snapshot) { this.snap = structuredClone(n); this.flush(); }
  async copyItem(i: PinItem) {
    if (i.kind === "image") {
      const blob = await (await fetch(i.content)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } else await navigator.clipboard.writeText(i.content);
  }
  async openItem(i: PinItem) { if (i.kind === "url") { window.open(i.content, "_blank", "noopener"); return true; } return false; }
  async revealItem() { return false; }
}
