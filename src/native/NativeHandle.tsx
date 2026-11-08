import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applySettings, mergeSettings, type Settings } from "../lib/settings";
import type { Edge } from "../lib/types";

/** The permanent edge tab, in its own tiny native window (16 dip wide, never resized). Dragging is performed by Rust (it follows the OS cursor across monitors/DPI). */

export function NativeHandle() {
  const [edge, setEdge] = useState<Edge>("right"); const [active, setActive] = useState(false); const [pulse, setPulse] = useState(0); const [unseen, setUnseen] = useState(false);
  const activeRef = useRef(false); activeRef.current = active;
  useEffect(() => {
    const offs: Promise<() => void>[] = [];
    invoke<Edge>("current_edge").then(setEdge);
    invoke<Settings>("get_settings").then((x) => applySettings(mergeSettings(x)));
    offs.push(listen<{ edge: Edge }>("placement", (e) => setEdge(e.payload.edge)));
    offs.push(listen<boolean>("board-visibility", (e) => { setActive(e.payload); if (e.payload) setUnseen(false); }));
    offs.push(listen<Settings>("settings-changed", (e) => applySettings(mergeSettings(e.payload))));
    offs.push(listen("items-changed", () => { setPulse((n) => n + 1); setUnseen((u) => u || !activeRef.current); })); // the tab pulses once and keeps a small light until the board is opened
    return () => { offs.forEach((p) => p.then((f) => f())); };
  }, []);
  const vertical = edge === "left" || edge === "right";
  return (
    <div className="handle-root">
      <div key={pulse} className={`handle ${vertical ? "v" : "h"} ${active ? "active" : ""} ${pulse ? "pulse" : ""}`} data-edge={edge} data-unseen={unseen} role="button" aria-label="Open MyPinboard"
        onPointerDown={(e) => { if (e.button === 0) void invoke("begin_handle_drag"); }}><span /></div>
    </div>
  );
}
