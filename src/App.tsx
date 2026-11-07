import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocalBackend } from "./lib/api";
import { classifyText } from "./lib/capture";
import { ANIM_DURATION_MS } from "./lib/settings";
import { boardRect, handleRect, nearestEdge, offsetFor, recoverPlacement, type Pt } from "./lib/edge";
import { baseFontPx, boardSize, density as densityOf, gridColumns } from "./lib/layout";
import { useStore } from "./lib/store";
import type { Edge } from "./lib/types";
import { Board } from "./components/Board";

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
  const [live, setLive] = useState<{ edge: Edge; offset: number } | null>(null);        // handle being dragged
  const [free, setFree] = useState<Pt | null>(null);                                       // board being moved (top-left)
  const [guide, setGuide] = useState<Edge | null>(null);
  const [fileDrag, setFileDrag] = useState(false);
  const busy = useRef(false); // true while moving the handle/board: outside-click must not close
  const timers = useRef<number[]>([]);

  const place = live ?? (s ? recoverPlacement(s.edge, s.offset, area) : { edge: "right" as Edge, offset: 0.5 });
  const size = useMemo(() => boardSize(area, place.edge), [area, place.edge]);
  const rect = boardRect(place.edge, place.offset, area, size);
  const dens = densityOf(size);
  const dur = !s || s.animSpeed === 0 ? 0 : ANIM_DURATION_MS / s.animSpeed;

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const openBoard = useCallback(() => { clearTimers(); setPhase("opening"); requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open"))); }, []);
  const closeBoard = useCallback(() => { clearTimers(); setPhase((p) => (p === "closed" ? p : "closing")); timers.current.push(window.setTimeout(() => setPhase("closed"), dur + 30)); }, [dur]);
  const toggle = useCallback(() => (phase === "open" || phase === "opening" ? closeBoard() : openBoard()), [phase, openBoard, closeBoard]);

  // Keyboard: Ctrl+F opens + focuses search; Win+Alt+S is registered natively (Rust) later; Alt+Shift+S works in the browser preview.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "f") { e.preventDefault(); if (phase === "closed" || phase === "closing") openBoard(); setSearchTick((n) => n + 1); }
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); toggle(); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [phase, openBoard, toggle]);

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

  if (!store.snap) return null;
  return (
    <div className="stage" data-edge={place.edge}>
      {visible && <div className="scrim" onPointerDown={() => { if (!fileDrag && !busy.current) closeBoard(); }} />}
      {guide && ["left", "right", "top", "bottom"].map((e) => <div key={e} className={`guide ${e} ${e === guide ? "hot" : ""}`} />)}

      <div className={`handle ${vertical ? "v" : "h"} ${phase === "open" ? "active" : ""} ${live ? "dragging" : ""}`} data-edge={place.edge} role="button" tabIndex={0}
        aria-label="Open MyPinboard" aria-expanded={phase === "open"} title="Click to open · drag to move"
        style={{ left: hr.x, top: hr.y, width: hr.w, height: hr.h }} onPointerDown={onHandleDown} onDragEnter={() => { if (fileDrag && phase === "closed") openBoard(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}><span /></div>

      {visible && (
        <section className={`board ${free ? "moving" : ""}`} data-state={phase} data-edge={place.edge} aria-label="MyPinboard"
          style={{ left: br.x, top: br.y, width: br.w, height: br.h }}>
          <Board store={store} cols={gridColumns(br.w, dens)} density={dens} fontPx={baseFontPx(br.w)} dropping={fileDrag} onClose={closeBoard} gripProps={{ onPointerDown: onGripDown }} searchTick={searchTick} />
        </section>
      )}
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
