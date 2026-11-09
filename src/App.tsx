import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocalBackend } from "./lib/api";
import { classifyText } from "./lib/capture";
import { closeMs, motionSpeed } from "./lib/settings";
import { boardRect, handleRect, nearestEdge, offsetFor, recoverPlacement, type Pt } from "./lib/edge";
import { panelSize } from "./lib/layout";
import { useStore } from "./lib/store";
import type { Edge } from "./lib/types";
import { Panel } from "./components/Panel";
import { SettingsApp, isSection, type Section } from "./components/settings/SettingsApp";
import { Icon } from "./components/Ui";
import { MotionRoot } from "./components/Motion";
import { Toast } from "./components/Toast";

type Phase = "closed" | "opening" | "open" | "closing";
const backend = new LocalBackend();
const MAX_IMG = 8 * 1024 * 1024;

function useArea() {
  const [a, setA] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => { const f = () => setA({ width: innerWidth, height: innerHeight }); addEventListener("resize", f); return () => removeEventListener("resize", f); }, []);
  return a;
}
const readDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

export default function App() {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const showToast = useCallback((m: string) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 1800); }, []);
  useEffect(() => { const f = (e: Event) => showToast((e as CustomEvent<string>).detail); addEventListener("pb-toast", f); return () => removeEventListener("pb-toast", f); }, [showToast]);

  const store = useStore(backend, showToast);
  const area = useArea();
  const s = store.snap?.settings;
  const [phase, setPhase] = useState<Phase>("closed");
  const [searchTick, setSearchTick] = useState(0);
  // The full settings window. In the Windows app it is a separate native window; the browser preview shows it as a window-like layer. `?settings=animations` deep-links.
  const [settingsAt, setSettingsAt] = useState<Section | null>(() => { const v = new URLSearchParams(location.search).get("settings"); return isSection(v) ? v : null; });
  const lastSection = useRef<Section>("appearance");
  const [live, setLive] = useState<{ edge: Edge; offset: number } | null>(null);        // handle being dragged
  const [free, setFree] = useState<Pt | null>(null);                                       // board being moved (top-left)
  const [guide, setGuide] = useState<Edge | null>(null);
  const [fileDrag, setFileDrag] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const busy = useRef(false); // true while moving the handle/board: outside-click must not close
  const timers = useRef<number[]>([]);

  const place = live ?? (s ? recoverPlacement(s.edge, s.offset, area) : { edge: "right" as Edge, offset: 0.5 });
  const size = useMemo(() => panelSize(area, place.edge, s?.panelWidth ?? 380, s?.panelHeight ?? 540), [area, place.edge, s?.panelWidth, s?.panelHeight]);
  const rect = boardRect(place.edge, place.offset, area, size);
  const dur = s ? closeMs(s) : 0;

  // "New since you last looked": a newly captured item while the board is closed lights the handle; opening the board clears it.
  const newest = store.snap?.items.reduce((m, i) => Math.max(m, i.capturedAt), 0) ?? 0; const seenNewest = useRef<number | null>(null);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!store.snap) return;
    if (seenNewest.current === null) { seenNewest.current = newest; return; }
    if (newest > seenNewest.current) { seenNewest.current = newest; if (phase === "closed" || phase === "closing") { setUnseen(true); setPulse((n) => n + 1); } }
  }, [newest, store.snap, phase]);
  useEffect(() => { if (phase === "opening" || phase === "open") setUnseen(false); }, [phase]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const openBoard = useCallback(() => { clearTimers(); setPhase("opening"); requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open"))); }, []);
  const closeBoard = useCallback(() => { clearTimers(); setPhase((p) => (p === "closed" ? p : "closing")); timers.current.push(window.setTimeout(() => setPhase("closed"), dur + 30)); }, [dur]);
  const openSettings = useCallback((sec?: string) => { const next = isSection(sec) ? sec : lastSection.current; lastSection.current = next; setSettingsAt(next); closeBoard(); }, [closeBoard]);
  const toggle = useCallback(() => (phase === "open" || phase === "opening" ? closeBoard() : openBoard()), [phase, openBoard, closeBoard]);

  // Keyboard: Ctrl+F opens + focuses search; Win+Alt+S is registered natively (Rust) later; Alt+Shift+S works in the browser preview.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "f" && !settingsAt) { e.preventDefault(); if (phase === "closed" || phase === "closing") openBoard(); setSearchTick((n) => n + 1); }
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); toggle(); }
      if (e.key === "Escape" && settingsAt && !e.defaultPrevented && !document.querySelector(".modal, .palette, .menu, .selbar, .viewer")) { e.preventDefault(); setSettingsAt(null); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [phase, openBoard, toggle, settingsAt]);

  // Paste anywhere (outside text fields) → capture.
  const ingest = useCallback(async (dt: DataTransfer) => {
    for (const f of Array.from(dt.files)) {
      if (f.type.startsWith("image/") && f.size <= MAX_IMG) store.capture({ kind: "image", content: await readDataUrl(f), sizeBytes: f.size, title: f.name || "Image" });
      else store.capture({ kind: "file", content: f.name, sizeBytes: f.size });
    }
    if (!dt.files.length) { const t = dt.getData("text/plain"); if (t.trim()) store.capture({ kind: classifyText(t), content: t, sizeBytes: new Blob([t]).size }); }
  }, [store]);
  useEffect(() => {
    const paste = (e: ClipboardEvent) => { const el = e.target as HTMLElement; if (el.closest("input,textarea") || !e.clipboardData) return; e.preventDefault(); void ingest(e.clipboardData); };
    let depth = 0;
    const enter = (e: DragEvent) => { if (!e.dataTransfer?.types.includes("Files")) return; depth++; setFileDrag(true); };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setFileDrag(false); };
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files") || e.dataTransfer?.types.includes("text/plain")) e.preventDefault(); };
    const drop = (e: DragEvent) => { e.preventDefault(); depth = 0; setFileDrag(false); if (e.dataTransfer && !(e.target as HTMLElement).closest(".card")) void ingest(e.dataTransfer); };
    addEventListener("paste", paste); addEventListener("dragenter", enter); addEventListener("dragleave", leave); addEventListener("dragover", over); addEventListener("drop", drop);
    return () => { removeEventListener("paste", paste); removeEventListener("dragenter", enter); removeEventListener("dragleave", leave); removeEventListener("dragover", over); removeEventListener("drop", drop); };
  }, [ingest]);

  // Handle drag: moves along / between edges, snaps on release. A <4px movement is a click.
  const onHandleDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY }; let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true; busy.current = true; const p = { x: ev.clientX, y: ev.clientY }; const edge = nearestEdge(p, area);
      setLive({ edge, offset: offsetFor(edge, p, area) }); setGuide(edge);
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      setGuide(null);
      if (moved) { const p = { x: ev.clientX, y: ev.clientY }; const edge = nearestEdge(p, area); store.setSettings({ edge, offset: offsetFor(edge, p, area) }); setLive(null); setTimeout(() => (busy.current = false), 50); }
      else toggle();
    };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };

  // Board move: drag the grip; on release the board docks to the nearest edge.
  const onGripDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId);
    const dx = e.clientX - rect.x, dy = e.clientY - rect.y; busy.current = true;
    const move = (ev: PointerEvent) => { const x = Math.min(Math.max(ev.clientX - dx, 0), area.width - rect.w), y = Math.min(Math.max(ev.clientY - dy, 0), area.height - rect.h); setFree({ x, y }); setGuide(nearestEdge({ x: x + rect.w / 2, y: y + rect.h / 2 }, area)); };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      const c = { x: Math.min(Math.max(ev.clientX - dx, 0), area.width - rect.w) + rect.w / 2, y: Math.min(Math.max(ev.clientY - dy, 0), area.height - rect.h) + rect.h / 2 };
      const edge = nearestEdge(c, area); store.setSettings({ edge, offset: offsetFor(edge, c, area) }); setFree(null); setGuide(null); setTimeout(() => (busy.current = false), 50);
    };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };

  const hr = handleRect(place.edge, place.offset, area);
  const br = free ? { x: free.x, y: free.y, w: rect.w, h: rect.h } : rect;
  const vertical = place.edge === "left" || place.edge === "right";
  const visible = phase !== "closed";

  return (
    <MotionRoot speed={s ? motionSpeed(s) : 1}>
    <div className="stage" data-edge={place.edge}>
      {visible && <div className="scrim" onPointerDown={() => { if (!fileDrag && !busy.current && s?.closeOnBlur !== false) closeBoard(); }} />}
      {guide && ["left", "right", "top", "bottom"].map((e) => <div key={e} className={`guide ${e} ${e === guide ? "hot" : ""}`} />)}

      <div key={pulse} className={`handle ${vertical ? "v" : "h"} ${phase === "open" ? "active" : ""} ${live ? "dragging" : ""} ${pulse ? "pulse" : ""}`} data-edge={place.edge} data-unseen={unseen} role="button" tabIndex={0}
        aria-label="Open MyPinboard" aria-expanded={phase === "open"} title="Click to open · drag to move"
        style={{ left: hr.x, top: hr.y, width: hr.w, height: hr.h }} onPointerDown={onHandleDown} onDragEnter={() => { if (fileDrag && phase === "closed") openBoard(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}><span /></div>

      {visible && s && (
        <Panel store={store} edge={place.edge} open={phase === "opening" || phase === "open"} dropping={fileDrag} searchTick={searchTick} mode="absolute" onClose={closeBoard} onOpenSettings={openSettings}
          style={{ left: br.x, top: br.y, width: br.w, height: br.h }} gripProps={{ onPointerDown: onGripDown }} />
      )}
      {settingsAt && store.snap && <>
        <div className="sa-window-scrim" onPointerDown={() => setSettingsAt(null)} />
        <div className="sa-window" role="dialog" aria-label="MyPinboard settings">
          <div className="sa-titlebar"><span>MyPinboard — Settings</span><button className="icon-btn" aria-label="Close settings window" onClick={() => setSettingsAt(null)}><Icon name="close" size={14} /></button></div>
          <SettingsApp store={store} section={settingsAt} onSection={(x) => { lastSection.current = x; setSettingsAt(x); }} />
        </div>
      </>}
      <Toast message={visible ? null : toast} />
    </div>
    </MotionRoot>
  );
}
