import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Collection, PinItem } from "../lib/types";

export interface MenuActions { copy(): void; open(): void; edit(): void; rename(): void; tag(): void; pin(): void; fav(): void; move(id: string): void; reveal(): void; remove(): void }
export function ContextMenu({ item, collections, x, y, actions, onClose }: { item: PinItem; collections: Collection[]; x: number; y: number; actions: MenuActions; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const [pos, setPos] = useState({ x, y }); const [sub, setSub] = useState(false);
  useLayoutEffect(() => { const r = ref.current!.getBoundingClientRect(); setPos({ x: Math.max(8, Math.min(x, innerWidth - r.width - 8)), y: Math.max(8, Math.min(y, innerHeight - r.height - 8)) }); }, [x, y]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; addEventListener("keydown", k, true); return () => removeEventListener("keydown", k, true); }, [onClose]);
  const run = (f: () => void) => () => { f(); onClose(); };
  const native = item.kind === "file" || item.kind === "folder" || item.kind === "group";
  return (
    <div className="menu-scrim" onPointerDown={(e) => { e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div ref={ref} className="menu" role="menu" style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()}>
        <button role="menuitem" onClick={run(actions.copy)}>Copy</button>
        <button role="menuitem" onClick={run(actions.open)}>{item.kind === "url" ? "Open link" : item.kind === "text" ? "Edit text" : native ? "Open / Review" : "View"}</button>
        {item.kind === "text" && <button role="menuitem" onClick={run(actions.edit)}>Edit…</button>}
        {native && <button role="menuitem" onClick={run(actions.reveal)}>Show in folder</button>}
        <hr />
        <button role="menuitem" onClick={run(actions.pin)}>{item.pinned ? "Unpin" : "Pin"}</button>
        <button role="menuitem" onClick={run(actions.fav)}>{item.favorite ? "Remove favourite" : "Favourite"}</button>
        <button role="menuitem" onClick={run(actions.rename)}>Rename label…</button>
        <button role="menuitem" onClick={run(actions.tag)}>Add tag…</button>
        <button role="menuitem" aria-expanded={sub} onClick={() => setSub((s) => !s)}>Move to collection ▾</button>
        {sub && <div className="submenu">{collections.map((c) => <button key={c.id} role="menuitem" disabled={c.id === item.collectionId} onClick={run(() => actions.move(c.id))}><i style={{ background: c.color }} />{c.name}</button>)}</div>}
        <hr />
        <button role="menuitem" className="danger" onClick={run(actions.remove)}>Remove from board</button>
      </div>
    </div>
  );
}
