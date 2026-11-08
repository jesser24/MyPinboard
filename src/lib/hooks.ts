import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Width of an element, kept current with a ResizeObserver (cleaned up on unmount). */
export function useElementWidth(ref: RefObject<HTMLElement>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export interface DragState { ids: string[]; x: number; y: number; hot?: string }

/**
 * Drag items onto a collection in the sidebar, using plain pointer events.
 * HTML5 drag-and-drop is deliberately not used: Tauri's native drag-drop handler (needed for files dropped onto the board) disables it on Windows.
 * A drag starts after 6 px of movement, so ordinary clicks, double-clicks and text selection are untouched. Mouse and pen only; touch keeps scrolling.
 */
export function useItemDrag(onDrop: (ids: string[], collectionId: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppress = useRef(false); const drop = useRef(onDrop); drop.current = onDrop;

  const begin = useCallback((e: React.PointerEvent, ids: string[]) => {
    if (e.button !== 0 || e.pointerType === "touch" || e.altKey) return;
    const start = { x: e.clientX, y: e.clientY }; let active = false; let hot: string | undefined;
    const target = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-drop-collection]")?.dataset.dropCollection;
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      active = true; hot = target(ev.clientX, ev.clientY); document.body.style.cursor = "grabbing";
      setDrag({ ids, x: ev.clientX, y: ev.clientY, hot });
    };
    const end = (ev: PointerEvent) => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
      document.body.style.cursor = "";
      if (active) { if (ev.type === "pointerup" && hot) drop.current(ids, hot); suppress.current = true; window.setTimeout(() => { suppress.current = false; }, 80); setDrag(null); }
    };
    addEventListener("pointermove", move); addEventListener("pointerup", end); addEventListener("pointercancel", end);
  }, []);

  /** True right after a drag ended: the click that follows pointerup must not copy the item. */
  const justDragged = useCallback(() => suppress.current, []);
  return { drag, begin, justDragged };
}
