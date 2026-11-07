import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applySettings, type Settings } from "../lib/settings";
import type { Edge } from "../lib/types";

/** The permanent edge tab, in its own tiny native window. Dragging is performed by Rust (it follows the OS cursor across monitors/DPI). */
const VISIBLE = 10;
const place = (edge: Edge): React.CSSProperties =>
  edge === "left" ? { left: 0, top: 0, bottom: 0, width: VISIBLE } : edge === "right" ? { right: 0, top: 0, bottom: 0, width: VISIBLE }
  : edge === "top" ? { top: 0, left: 0, right: 0, height: VISIBLE } : { bottom: 0, left: 0, right: 0, height: VISIBLE };

export function NativeHandle() {
  const [edge, setEdge] = useState<Edge>("right"); const [active, setActive] = useState(false); const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const offs: Promise<() => void>[] = [];
    invoke<Edge>("current_edge").then(setEdge);
    invoke<Settings>("get_settings").then(applySettings);
    offs.push(listen<{ edge: Edge }>("placement", (e) => setEdge(e.payload.edge)));
    offs.push(listen<boolean>("board-visibility", (e) => setActive(e.payload)));
    offs.push(listen<Settings>("settings-changed", (e) => applySettings(e.payload)));
    offs.push(listen("items-changed", () => setPulse((n) => n + 1))); // subtle feedback: the tab glows when something is collected
    return () => { offs.forEach((p) => p.then((f) => f())); };
  }, []);
  const vertical = edge === "left" || edge === "right";
  return (
    <div className="handle-root">
      <div key={pulse} className={`handle ${vertical ? "v" : "h"} ${active ? "active" : ""} ${pulse ? "pulse" : ""}`} data-edge={edge} role="button" aria-label="Open MyPinboard"
        style={place(edge)} onPointerDown={(e) => { if (e.button === 0) void invoke("begin_handle_drag"); }}><span /></div>
    </div>
  );
}
