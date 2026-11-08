import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ANIM_DURATION_MS, applySettings, mergeSettings, type Settings } from "../lib/settings";
import { useStore } from "../lib/store";
import type { Edge } from "../lib/types";
import { Board } from "../components/Board";
import { MotionRoot } from "../components/Motion";
import { Toast } from "../components/Toast";
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

  // `store` is a new object on every render, so openUi/closeUi change identity constantly. The listeners below call them through refs so this effect
  // subscribes exactly once per mount instead of tearing down and re-registering every native listener (asynchronously) after each render.
  const openRef = useRef(openUi); const closeRef = useRef(closeUi); const hasSnap = useRef(false);
  openRef.current = openUi; closeRef.current = closeUi; hasSnap.current = store.snap !== null;

  useEffect(() => {
    const offs: Promise<() => void>[] = [];
    offs.push(listen("board-show", () => openRef.current()));
    offs.push(listen("board-close", () => closeRef.current()));
    offs.push(listen("board-blur", () => { if (busy.current <= 0) closeRef.current(); }));
    offs.push(listen<boolean>("drop-state", (e) => setDropping(e.payload)));
    offs.push(listen<{ edge: Edge }>("placement", (e) => setEdge(e.payload.edge)));
    offs.push(listen<Settings>("settings-changed", (e) => applySettings(mergeSettings(e.payload))));
    offs.push(listen<string>("native-info-changed", (e) => { document.documentElement.dataset.backdrop = e.payload; }));
    invoke<Edge>("current_edge").then(setEdge);
    Promise.all(offs).then(() => invoke("board_ready")); // only now can Rust safely show us
    const busyFn = (e: Event) => { busy.current += (e as CustomEvent<number>).detail; };
    const resize = () => setSize({ width: innerWidth, height: innerHeight });
    const paste = (e: ClipboardEvent) => { if ((e.target as HTMLElement).closest("input,textarea")) return; e.preventDefault(); void backend.captureClipboard().catch((err) => showToast(String(err))); };
    // Escape: once the snapshot is loaded, <Board> owns it and closes the innermost layer first (dialog → settings → search text → board), and the
    // context menu swallows it in the capture phase. A second unconditional close here would defeat those layers (it closed the whole board with a
    // dialog open), so this listener is only the safety net while <Board> is not mounted yet.
    const keydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || hasSnap.current) return;
      if (phaseRef.current === "hidden" || phaseRef.current === "closing") return;
      e.preventDefault();
      closeRef.current();
    };
    addEventListener("pb-busy", busyFn); addEventListener("resize", resize); addEventListener("paste", paste); addEventListener("keydown", keydown);
    return () => { offs.forEach((p) => p.then((f) => f())); removeEventListener("pb-busy", busyFn); removeEventListener("resize", resize); removeEventListener("paste", paste); removeEventListener("keydown", keydown); };
  }, [backend, showToast]);

  return (
    <MotionRoot speed={store.snap?.settings.animSpeed ?? 1}>
    <div className="stage" data-edge={edge}>
      <section className="board native" data-state={phase === "hidden" ? "closing" : phase} data-edge={edge} aria-label="MyPinboard">
        <Board store={store} width={size.width} dropping={dropping} onClose={closeUi}
          gripProps={{ onPointerDown: (e) => { if (e.button === 0) void invoke("begin_board_drag"); } }} searchTick={searchTick} />
      </section>
      <Toast message={toast} />
    </div>
    </MotionRoot>
  );
}
