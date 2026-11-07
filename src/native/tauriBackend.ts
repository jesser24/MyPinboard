/** Backend implementation backed by the Rust core (SQLite). Same interface as LocalBackend, so the UI is unchanged. */
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Backend, Snapshot } from "../lib/api";
import type { Collection, PinItem } from "../lib/types";
import type { Settings } from "../lib/settings";

export interface NativeInfo { dataDir: string; imagesDir: string; logsDir: string; backdrop: string; portable: boolean; version: string }
export interface StorageInfo { dataDir: string; dbBytes: number; imagesBytes: number; imageCount: number; itemCount: number; portable: boolean }
export const isNative = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export class TauriBackend implements Backend {
  native: NativeInfo | null = null;
  async init() { this.native = await invoke<NativeInfo>("native_info"); setImageResolver((i) => this.imageSrc(i)); return this.native; }
  load() { return invoke<Snapshot>("get_snapshot"); }
  upsertItem(i: PinItem) { return invoke<void>("upsert_item", { item: i }); }
  removeItems(ids: string[]) { return invoke<void>("remove_items", { ids }); }
  saveCollections(c: Collection[]) { return invoke<void>("save_collections", { collections: c }); }
  async saveSettings(s: Settings) { return invoke<string[]>("save_settings", { settings: s }); }
  restore(s: Snapshot) { return invoke<void>("restore_snapshot", { snapshot: s }); }
  copyItem(i: PinItem) { return invoke<void>("copy_item", { item: i }); }
  openItem(i: PinItem) { return invoke<boolean>("open_item", { item: i }); }
  revealItem(i: PinItem) { return invoke<boolean>("reveal_item", { item: i }); }
  captureClipboard() { return invoke("capture_clipboard_now"); }
  storageInfo() { return invoke<StorageInfo>("storage_info"); }
  openDataDir() { return invoke<void>("open_data_dir"); }
  subscribe(cb: (e: { id: string; duplicate: boolean; origin: string }) => void): Promise<UnlistenFn> { return listen<{ id: string; duplicate: boolean; origin: string }>("items-changed", (e) => cb(e.payload)); }
  imageSrc(i: PinItem): string {
    if (!i.content.startsWith("pbimg:") || !this.native) return i.content;
    const sep = this.native.imagesDir.includes("\\") ? "\\" : "/";
    return convertFileSrc(`${this.native.imagesDir}${sep}${i.content.slice(6)}`);
  }
}

let resolver: (i: PinItem) => string = (i) => i.content;
export function setImageResolver(f: (i: PinItem) => string) { resolver = f; }
/** `src` for an image item: a data URL in the browser preview, a file served by the asset protocol natively. */
export const imageSrc = (i: PinItem) => resolver(i);
