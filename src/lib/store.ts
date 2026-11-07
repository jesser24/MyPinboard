import { useCallback, useEffect, useRef, useState } from "react";
import type { Backend, Snapshot } from "./api";
import type { Collection, PinItem } from "./types";
import { addCapture, allowed, hashKey, titleFor, type NewCapture } from "./capture";
import { dedupeKey } from "./dedupe";
import { applySettings, type Settings } from "./settings";

export function useStore(backend: Backend, onToast: (m: string) => void) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const ref = useRef<Snapshot | null>(null);
  const commit = (s: Snapshot) => { ref.current = s; setSnap(s); };

  useEffect(() => { backend.load().then((s) => { commit(s); applySettings(s.settings); }); }, [backend]);

  /** Native only: items captured by Rust while this window was open (clipboard, drops) appear immediately. */
  const reload = useCallback(async () => { const s = await backend.load(); commit(s); applySettings(s.settings); }, [backend]);
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

  const remove = useCallback((ids: string[]) => { const s = ref.current; if (!s) return;
    commit({ ...s, items: s.items.filter((i) => !ids.includes(i.id)) }); void backend.removeItems(ids); }, [backend]);

  const setSettings = useCallback((patch: Partial<Settings>) => { const s = ref.current; if (!s) return;
    const settings = { ...s.settings, ...patch }; commit({ ...s, settings }); applySettings(settings);
    void Promise.resolve(backend.saveSettings(settings)).then((w) => { if (Array.isArray(w) && w.length) onToast(w[0]); }); }, [backend, onToast]);

  const setCollections = useCallback((collections: Collection[]) => { const s = ref.current; if (!s) return;
    commit({ ...s, collections }); void backend.saveCollections(collections); }, [backend]);

  const clearHistory = useCallback(() => { const s = ref.current; if (!s) return;
    const drop = s.items.filter((i) => !i.pinned && !i.favorite).map((i) => i.id); remove(drop); onToast(`Cleared ${drop.length} items (pinned and favourites kept)`); }, [remove, onToast]);

  const restore = useCallback(async (n: Snapshot) => { await backend.restore(n); commit(n); applySettings(n.settings); }, [backend]);

  const copy = useCallback(async (i: PinItem) => { try { await backend.copyItem(i); onToast("Copied"); } catch { onToast("Could not copy"); } }, [backend, onToast]);

  const retitle = useCallback((i: PinItem, title: string) => patchItem(i.id, { title: title.trim() || titleFor(i.kind, i.content) }), [patchItem]);

  return { snap, reload, capture, patchItem, remove, setSettings, setCollections, clearHistory, restore, copy, retitle, backend };
}
export type Store = ReturnType<typeof useStore>;
