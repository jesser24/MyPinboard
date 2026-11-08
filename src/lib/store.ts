import { useCallback, useEffect, useRef, useState } from "react";
import type { Backend, Snapshot } from "./api";
import type { Collection, PinItem } from "./types";
import { addCapture, allowed, hashKey, titleFor, type NewCapture } from "./capture";
import { dedupeKey } from "./dedupe";
import { applySettings, mergeSettings, type Settings } from "./settings";
import { PendingDeletes } from "./pending";
import { expiredItems } from "./retention";

export const COLLECTION_COLORS = ["#7b6cf6", "#2f8cf0", "#1fae83", "#d9912b", "#ec5f5f", "#c45ee0", "#5fb0c9", "#8c93a6"];

/** The native backend returns stored JSON verbatim; fill defaults for settings added after that data was written. */
const normalise = (s: Snapshot): Snapshot => ({ ...s, settings: mergeSettings(s.settings) });

export function useStore(backend: Backend, onToast: (m: string) => void) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Snapshot | null>(null);
  const commit = (s: Snapshot) => { ref.current = s; setSnap(s); };
  const pending = useRef<PendingDeletes | null>(null);
  if (!pending.current) pending.current = new PendingDeletes((ids) => { void backend.removeItems(ids); });
  /** A reload from the backend must not bring back items whose delete can still be undone. */
  const prep = (raw: Snapshot): Snapshot => {
    const s = normalise(raw); const wait = pending.current!.ids();
    let items = wait.size ? s.items.filter((i) => !wait.has(i.id)) : s.items;
    const old = expiredItems(items, s.settings.retentionDays);
    if (old.length) { const gone = new Set(old.map((i) => i.id)); items = items.filter((i) => !gone.has(i.id)); void backend.removeItems([...gone]); }
    return { ...s, items };
  };
  useEffect(() => { const f = () => pending.current?.flush(); addEventListener("pagehide", f); return () => removeEventListener("pagehide", f); }, []);

  const load = useCallback(() => {
    setError(null);
    backend.load().then((raw) => { const s = prep(raw); commit(s); applySettings(s.settings); }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [backend]);
  useEffect(() => { load(); }, [load]);

  /** Native only: items captured by Rust while this window was open (clipboard, drops) appear immediately. */
  const reload = useCallback(async () => { const s = prep(await backend.load()); commit(s); applySettings(s.settings); }, [backend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let off: (() => void) | undefined; let timer: number | undefined; let alive = true;
    backend.subscribe?.((e) => { clearTimeout(timer); timer = window.setTimeout(() => { void reload(); if (e.origin !== "ui") onToast(e.duplicate ? "Already saved — moved to top" : "Saved to board"); }, 80); }).then((u) => { if (alive) off = u; else u(); });
    return () => { alive = false; clearTimeout(timer); off?.(); };
  }, [backend, reload, onToast]);

  const capture = useCallback((c: Omit<NewCapture, "collectionId"> & { collectionId?: string }): boolean => {
    const s = ref.current; if (!s) return false;
    if (!allowed(c.kind, s.settings, c.sourceApp)) { onToast("Capture is off for this type"); return false; }
    const r = addCapture(s.items, { ...c, collectionId: c.collectionId ?? s.collections[0].id }, s.settings.maxItems);
    commit({ ...s, items: r.items });
    void backend.upsertItem(r.item);
    const kept = new Set(r.items.map((i) => i.id));
    const evicted = s.items.filter((i) => !kept.has(i.id)).map((i) => i.id);
    if (evicted.length) void backend.removeItems(evicted);
    onToast(r.duplicate ? "Already saved — moved to top" : "Saved to board");
    return true;
  }, [backend, onToast]);

  const patchItem = useCallback((id: string, patch: Partial<PinItem>) => {
    const s = ref.current; if (!s) return;
    let changed: PinItem | undefined;
    const items = s.items.map((i) => { if (i.id !== id) return i; changed = { ...i, ...patch };
      if ("content" in patch) changed.hash = hashKey(dedupeKey(changed.kind, changed.content)); return changed; });
    commit({ ...s, items }); if (changed) void backend.upsertItem(changed);
  }, [backend]);

  /** Apply one patch to several items (bulk favourite, pin, move). Each change is written through the backend individually, like a single edit. */
  const patchMany = useCallback((ids: string[], patch: Partial<PinItem>) => { for (const id of ids) patchItem(id, patch); }, [patchItem]);

  const remove = useCallback((ids: string[]) => { const s = ref.current; if (!s) return;
    commit({ ...s, items: s.items.filter((i) => !ids.includes(i.id)) }); void backend.removeItems(ids); }, [backend]);

  /** Delete with a short Undo window. Returns how many items were removed. The backend (and image files) are only touched once the window passes. */
  const removeUndoable = useCallback((ids: string[]): number => { const s = ref.current; if (!s) return 0;
    const gone = s.items.filter((i) => ids.includes(i.id)); if (!gone.length) return 0;
    pending.current!.stage(gone); commit({ ...s, items: s.items.filter((i) => !ids.includes(i.id)) }); return gone.length; }, []);
  /** Bring back everything deleted inside the Undo window. */
  const undoRemove = useCallback((): number => { const s = ref.current; const back = pending.current!.undoAll(); if (!s || !back.length) return 0;
    commit({ ...s, items: [...s.items, ...back].sort((a, b) => b.capturedAt - a.capturedAt) }); return back.length; }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => { const s = ref.current; if (!s) return;
    const settings = { ...s.settings, ...patch }; commit({ ...s, settings }); applySettings(settings);
    void Promise.resolve(backend.saveSettings(settings)).then((w) => { if (Array.isArray(w) && w.length) onToast(w[0]); }); }, [backend, onToast]);

  /** Settings changed elsewhere (another window saved them): adopt them without writing anything back. */
  const syncSettings = useCallback((raw: unknown) => { const s = ref.current; if (!s) return; const settings = mergeSettings(raw); commit({ ...s, settings }); applySettings(settings); }, []);

  const setCollections = useCallback((collections: Collection[]) => { const s = ref.current; if (!s) return;
    commit({ ...s, collections }); void backend.saveCollections(collections); }, [backend]);

  /** Returns the new collection's id (so the caller can open it), or undefined when the name is empty. */
  const addCollection = useCallback((name: string): string | undefined => {
    const s = ref.current; const n = name.trim().slice(0, 24); if (!s || !n) return undefined;
    const id = `c-${Date.now().toString(36)}`;
    setCollections([...s.collections, { id, name: n, color: COLLECTION_COLORS[s.collections.length % COLLECTION_COLORS.length] }]); return id;
  }, [setCollections]);
  const renameCollection = useCallback((id: string, name: string) => { const s = ref.current; const n = name.trim().slice(0, 24); if (!s || !n) return;
    setCollections(s.collections.map((c) => (c.id === id ? { ...c, name: n } : c))); }, [setCollections]);
  /** Deleting never deletes items: they move to the first remaining collection. The last collection cannot be deleted. */
  const deleteCollection = useCallback((id: string) => { const s = ref.current; if (!s || s.collections.length <= 1) return;
    const fallback = s.collections.find((c) => c.id !== id)!.id;
    s.items.filter((i) => i.collectionId === id).forEach((i) => patchItem(i.id, { collectionId: fallback }));
    setCollections((ref.current ?? s).collections.filter((c) => c.id !== id)); }, [patchItem, setCollections]);

  const clearHistory = useCallback(() => { const s = ref.current; if (!s) return;
    const drop = s.items.filter((i) => !i.pinned && !i.favorite).map((i) => i.id); remove(drop); onToast(`Cleared ${drop.length} items (pinned and favourites kept)`); }, [remove, onToast]);

  const restore = useCallback(async (n: Snapshot) => { const s = normalise(n); await backend.restore(s); commit(s); applySettings(s.settings); }, [backend]);

  const copy = useCallback(async (i: PinItem) => { try { await backend.copyItem(i); onToast("Copied"); } catch { onToast("Could not copy"); } }, [backend, onToast]);

  const retitle = useCallback((i: PinItem, title: string) => patchItem(i.id, { title: title.trim() || titleFor(i.kind, i.content) }), [patchItem]);

  return { snap, error, retry: load, reload, capture, patchItem, patchMany, remove, removeUndoable, undoRemove, setSettings, syncSettings, setCollections, addCollection, renameCollection, deleteCollection, clearHistory, restore, copy, retitle, backend };
}
export type Store = ReturnType<typeof useStore>;
