import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { AnimatePresence, m } from "motion/react";
import type { Store } from "../lib/store";
import type { Edge, PinItem } from "../lib/types";
import { runQuery } from "../lib/search";
import { panelAnimation } from "../lib/panelAnim";
import { useDebounced } from "../lib/hooks";
import { Icon } from "./Ui";
import { PanelItem } from "./PanelItem";
import { useMotion } from "./Motion";

const PAGE = 60;
const UNDO_MS = 6000;
type Note = { text: string; undo?: boolean; n: number };

export interface PanelProps {
  store: Store; edge: Edge; open: boolean; onClose(): void; onOpenSettings(section?: string): void;
  dropping?: boolean; searchTick?: number; gripProps?: HTMLAttributes<HTMLElement>;
  /** Native window / preview stage placement: "fill" covers its container, "static" sits in normal flow (settings preview). */
  mode?: "fill" | "absolute" | "static"; style?: React.CSSProperties; native?: boolean;
}

/**
 * The floating clipboard panel: header, search, recent items, footer. Nothing else: no sidebar, categories or settings live here.
 * Opening/closing is the user's chosen animation (`settings.animation`), the same code path the settings preview uses.
 */
export function Panel({ store, edge, open, onClose, onOpenSettings, dropping, searchTick = 0, gripProps, mode = "absolute", style, native }: PanelProps) {
  const snap = store.snap!; const s = snap.settings; const mo = useMotion();
  const [text, setText] = useState(""); const q = useDebounced(text, 120);
  const [limit, setLimit] = useState(PAGE); const [copiedId, setCopiedId] = useState<string>();
  const [note, setNote] = useState<Note | null>(null); const noteTimer = useRef<number>(); const copiedTimer = useRef<number>();
  const search = useRef<HTMLInputElement>(null); const list = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => () => { clearTimeout(noteTimer.current); clearTimeout(copiedTimer.current); }, []);

  const names = useMemo(() => new Map(snap.collections.map((c) => [c.id, c.name] as const)), [snap.collections]);
  const all = useMemo(() => runQuery(snap.items, { text: q, kinds: [], favoritesOnly: false, sort: "recent" }, names), [snap.items, q, names]);
  const shown = all.slice(0, limit);
  useEffect(() => setLimit(PAGE), [q]);
  const animate = shown.length <= 60;
  const paused = !s.capture.enabled;

  const flash = useCallback((text: string, ms: number, undo = false) => { clearTimeout(noteTimer.current); setNote((p) => ({ text, undo, n: (p?.n ?? 0) + 1 })); noteTimer.current = window.setTimeout(() => setNote(null), ms); }, []);

  const copy = useCallback(async (item: PinItem) => {
    try { await store.backend.copyItem(item); } catch { flash("Couldn’t copy that item", 2200); return; }
    setCopiedId(item.id); clearTimeout(copiedTimer.current); copiedTimer.current = window.setTimeout(() => setCopiedId(undefined), 1100);
    flash("Copied to clipboard", 1600);
    if (s.copyBehavior === "close") window.setTimeout(onClose, 260);
  }, [store.backend, flash, s.copyBehavior, onClose]);

  const deleted = useRef(0);
  const del = useCallback((item: PinItem) => {
    // Keep keyboard focus useful: move to the neighbouring row before this one leaves.
    const rows = Array.from(list.current?.querySelectorAll<HTMLElement>(".pi") ?? []); const at = rows.findIndex((r) => r.dataset.id === item.id);
    const nextFocus = rows[at + 1] ?? rows[at - 1];
    if (!store.removeUndoable([item.id])) return;
    deleted.current += 1; setNote((p) => ({ text: deleted.current > 1 ? `${deleted.current} items deleted` : "Item deleted", undo: true, n: (p?.n ?? 0) + 1 }));
    clearTimeout(noteTimer.current); noteTimer.current = window.setTimeout(() => { setNote(null); deleted.current = 0; }, UNDO_MS);
    (nextFocus ?? search.current)?.focus();
  }, [store]);
  const undo = useCallback(() => { const n = store.undoRemove(); deleted.current = 0; clearTimeout(noteTimer.current); if (n) flash(n > 1 ? `${n} items restored` : "Item restored", 1600); else setNote(null); }, [store, flash]);

  // Focus the search field whenever the panel opens (searchTick) and with "/" or Ctrl+F.
  useEffect(() => { if (open) { setText(""); const t = window.setTimeout(() => search.current?.focus(), 40); return () => clearTimeout(t); } }, [searchTick, open]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement; const inField = t.tagName === "INPUT" || t.tagName === "TEXTAREA";
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); search.current?.focus(); search.current?.select(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); onOpenSettings(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && note?.undo) { e.preventDefault(); undo(); return; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (text) { setText(""); search.current?.focus(); } else onClose(); return; }
    if (e.key === "/" && !inField) { e.preventDefault(); search.current?.focus(); return; }
    if (e.key === "ArrowDown" && inField) { e.preventDefault(); list.current?.querySelector<HTMLElement>(".pi")?.focus(); return; }
    if (t.classList.contains("pi")) {
      const rows = Array.from(list.current?.querySelectorAll<HTMLElement>(".pi") ?? []); const at = rows.indexOf(t); let to = -1;
      if (e.key === "ArrowDown") to = Math.min(rows.length - 1, at + 1); else if (e.key === "ArrowUp") to = at - 1; else if (e.key === "Home") to = 0; else if (e.key === "End") to = rows.length - 1;
      if (to >= 0) { e.preventDefault(); if (to < 0) search.current?.focus(); else { rows[to]?.focus(); rows[to]?.scrollIntoView({ block: "nearest" }); } }
      if (e.key === "ArrowUp" && at === 0) { e.preventDefault(); search.current?.focus(); }
    }
  };

  const anim = useMemo(() => panelAnimation(s.animation, edge, s.animDuration, s.animSpeed !== 0), [s.animation, edge, s.animDuration, s.animSpeed]);
  const tabId = shown[0]?.id;

  return (
    <m.section className={`panel ${mode}`} data-native={native || undefined} data-edge={edge} aria-label="MyPinboard clipboard" style={{ transformOrigin: anim.origin, ...style }}
      initial="closed" animate={open ? "open" : "closed"}
      variants={{ closed: { ...anim.closed, transition: anim.leave }, open: { ...anim.open, transition: anim.enter } }} onKeyDown={onKeyDown}>
      <header className="p-head">
        <div className="p-top">
          <div className="p-brand" title="Drag to move the panel" {...gripProps}><span className="logo"><Icon name="pin" size={14} /></span><b>MyPinboard</b></div>
          <div className="p-actions">
            {paused && <button className="p-paused" onClick={() => store.setSettings({ capture: { ...s.capture, enabled: true } })} title="Capture is paused — click to resume"><Icon name="play" size={13} />Paused</button>}
            <button className="icon-btn" aria-label="Open settings" title="Settings (Ctrl+,)" onClick={() => onOpenSettings()}><Icon name="settings" /></button>
            <button className="icon-btn" aria-label="Close panel" title="Close (Esc)" onClick={onClose}><Icon name="close" /></button>
          </div>
        </div>
        <label className="p-search"><Icon name="search" size={15} />
          <input ref={search} type="search" value={text} placeholder="Search clipboard" aria-label="Search clipboard" spellCheck={false} autoComplete="off" onChange={(e) => setText(e.target.value)} />
          {text && <button type="button" className="icon-btn clear" aria-label="Clear search" onClick={() => { setText(""); search.current?.focus(); }}><Icon name="close" size={13} /></button>}
        </label>
      </header>

      <div className="p-list" ref={list} role="list" aria-label="Clipboard items">
        {store.error && !snap.items.length
          ? <div className="p-empty" role="alert"><div className="art"><Icon name="about" size={20} /></div><b>Couldn’t load your items</b><span>Your data was not changed.</span><button className="btn small" onClick={store.retry}>Try again</button></div>
          : shown.length === 0
            ? <div className="p-empty" role="status"><div className="art"><Icon name={q ? "search" : "copy"} size={20} /></div>
                <b>{q ? "No matches" : paused ? "Capture is paused" : "Nothing copied yet"}</b>
                <span>{q ? `Nothing in your history matches “${q}”.` : paused ? "Resume capture to start saving what you copy." : "Copy text, an image, a file or a link — it shows up here."}</span>
                {q && <button className="btn small" onClick={() => setText("")}>Clear search</button>}</div>
            : <AnimatePresence initial={false}>
                {shown.map((i) => <PanelItem key={i.id} item={i} now={now} copied={copiedId === i.id} tabbable={i.id === tabId} animate={animate} onCopy={copy} onDelete={del} />)}
              </AnimatePresence>}
        {all.length > shown.length && <button className="p-more" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, all.length - shown.length)} more</button>}
      </div>

      <AnimatePresence>
        {note && (
          <m.div key="note" className="p-note" role="status" aria-live="polite" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6, transition: mo.fade }} transition={mo.spring}>
            <Icon name={note.undo ? "trash" : "check"} size={14} /><span>{note.text}</span>
            {note.undo && <button className="p-undo" onClick={undo}>Undo</button>}
          </m.div>
        )}
      </AnimatePresence>

      <footer className="p-foot">
        <span className="p-local" title="Everything stays on this PC. No account, no cloud."><Icon name="privacy" size={13} />Stored locally · {snap.items.length} {snap.items.length === 1 ? "item" : "items"}</span>
        <button className="p-full" onClick={() => onOpenSettings("library")} title="Open the full MyPinboard window">Open MyPinboard<Icon name="open" size={12} /></button>
      </footer>

      <AnimatePresence>{dropping && <m.div className="p-drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={mo.fade}><Icon name="plus" size={22} /><b>Drop to save</b></m.div>}</AnimatePresence>
    </m.section>
  );
}
