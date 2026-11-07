import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ANIM_DURATION_MS, applySettings, type Settings } from "../lib/settings";
import { baseFontPx, density as densityOf, gridColumns } from "../lib/layout";
import { useStore } from "../lib/store";
import type { Edge } from "../lib/types";
import { Board } from "../components/Board";
import type { TauriBackend } from "./tauriBackend";

type Phase = "hidden" | "opening" | "open" | "closing";

/** The board window. Rust shows/hides and positions the OS window; this component plays the same animations as the browser preview. */
export function NativeBoard({ backend }: { backend: TauriBackend }) {
  const [toast, setToast] = useState<string | null>(null); const timer = useRef<number>();
  const showToast = useCallback((m: string) => { setToast(m); clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 1800); }, []);
  useEffect(() => { const f = (e: Event) => showToast((e as CustomEvent<string>).detail); addEventListener("pb-toast", f); return () => removeEventListener("pb-toast", f); }, [showToast]);

  const store = useStore(backend, showToast);
  const [phase, setPhase] = useState<Phase>("hidden"); const phaseRef = useRef<Phase>("hidden");
  const [edge, setEdge] = useState<Edge>("right"); const [searchTick, setSearchTick] = useState(0); const [dropping, setDropping] = useState(false);
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  const busy = useRef(0); const timers = useRef<number[]>([]);
  const dur = store.snap?.settings.animSpeed === 0 ? 0 : ANIM_DURATION_MS / (store.snap?.settings.animSpeed || 1);
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const openUi = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    go("opening"); requestAnimationFrame(() => requestAnimationFrame(() => go("open"))); setSearchTick((n) => n + 1); void store.reload();
  }, [store]);
  const closeUi = useCallback(() => {
    if (phaseRef.current === "hidden" || phaseRef.current === "closing") return;
    go("closing"); timers.current.push(window.setTimeout(() => { go("hidden"); void invoke("hide_board"); }, dur + 30));
  }, [dur]);

  useEffect(() => {
    const offs: Promise<() => void>[] = [];
    offs.push(listen("board-show", openUi));
    offs.push(listen("board-close", closeUi));
    offs.push(listen("board-blur", () => { if (busy.current <= 0) closeUi(); }));
    offs.push(listen<boolean>("drop-state", (e) => setDropping(e.payload)));
    offs.push(listen<{ edge: Edge }>("placement", (e) => setEdge(e.payload.edge)));
    offs.push(listen<Settings>("settings-changed", (e) => applySettings(e.payload)));
    offs.push(listen<string>("native-info-changed", (e) => { document.documentElement.dataset.backdrop = e.payload; }));
    invoke<Edge>("current_edge").then(setEdge);
    Promise.all(offs).then(() => invoke("board_ready")); // only now can Rust safely show us
    const busyFn = (e: Event) => { busy.current += (e as CustomEvent<number>).detail; };
    const resize = () => setSize({ width: innerWidth, height: innerHeight });
    const paste = (e: ClipboardEvent) => { if ((e.target as HTMLElement).closest("input,textarea")) return; e.preventDefault(); void backend.captureClipboard().catch((err) => showToast(String(err))); };
    addEventListener("pb-busy", busyFn); addEventListener("resize", resize); addEventListener("paste", paste);
    return () => { offs.forEach((p) => p.then((f) => f())); removeEventListener("pb-busy", busyFn); removeEventListener("resize", resize); removeEventListener("paste", paste); };
  }, [openUi, closeUi, backend, showToast]);

  const dens = useMemo(() => densityOf(size), [size]);
  if (!store.snap) return null;
  return (
    <div className="stage" data-edge={edge}>
      <section className="board native" data-state={phase === "hidden" ? "closing" : phase} data-edge={edge} aria-label="MyPinboard">
        <Board store={store} cols={gridColumns(size.width, dens)} density={dens} fontPx={baseFontPx(size.width)} dropping={dropping} onClose={closeUi}
          gripProps={{ onPointerDown: (e) => { if (e.button === 0) void invoke("begin_board_drag"); } }} searchTick={searchTick} />
      </section>
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
