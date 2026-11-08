import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { m } from "motion/react";
import type { PinItem } from "../lib/types";
import { formatAgo, formatSize } from "../lib/capture";
import { fileInfo, looksLikeCode, previewLine, shortenPath, splitUrl } from "../lib/links";
import { imageSrc } from "../native/tauriBackend";
import { Icon, type IconName } from "./Ui";
import { useMotion } from "./Motion";

export const extOf = (i: PinItem) => (i.kind === "file" ? fileInfo(i.title.includes(".") ? i.title : i.content).ext || "FILE" : i.kind === "group" ? "×N" : "");

export interface CardProps {
  item: PinItem; view: "list" | "grid"; selected: boolean; tabbable: boolean; copied: boolean; dragging: boolean; animate: boolean; now: number;
  /** All handlers receive the item, so the parent can pass the same function instance to every row and memoisation holds. */
  onActivate(item: PinItem, e: React.MouseEvent | React.KeyboardEvent): void; onOpen(item: PinItem): void; onMenu(item: PinItem, x: number, y: number, fromKeyboard: boolean): void;
  onToggleSelect(item: PinItem, e: React.MouseEvent): void; onTag(t: string): void; onFav(item: PinItem): void; onPin(item: PinItem): void; onPointerDown(item: PinItem, e: React.PointerEvent): void;
}

interface Parts { title: string; sub: string[]; mono: boolean; icon: IconName; ext: string; thumbText?: string }
function describe(i: PinItem, dims: string): Parts {
  const ext = extOf(i); const app = i.sourceApp ? [i.sourceApp] : [];
  switch (i.kind) {
    case "url": { const u = splitUrl(i.content); return { title: i.title, sub: [i.title === u.domain && !u.path ? "" : `${u.domain}${u.path}`, ...app].filter(Boolean), mono: false, icon: "link", ext }; }
    case "image": return { title: i.title, sub: [dims, formatSize(i.sizeBytes), ...app].filter(Boolean), mono: false, icon: "image", ext };
    case "file": { const f = fileInfo(i.content); return { title: i.title, sub: [formatSize(i.sizeBytes), f.dir ? shortenPath(f.dir, 44) : "", ...app].filter(Boolean), mono: false, icon: "file", ext }; }
    case "folder": return { title: i.title, sub: [shortenPath(i.content, 52), ...app], mono: false, icon: "folder", ext };
    case "group": { const names = i.content.split("\n").filter(Boolean).map((p) => fileInfo(p).name); const more = names.length - 2;
      return { title: i.title, sub: [names.slice(0, 2).join(", ") + (more > 0 ? ` +${more} more` : ""), ...app], mono: false, icon: "file", ext }; }
    default: { const code = looksLikeCode(i.content); const pv = previewLine(i.content, i.title);
      return { title: i.title, sub: [pv, ...app].filter(Boolean), mono: code, icon: code ? "code" : "text", ext, thumbText: i.content.slice(0, 240) }; }
  }
}

/** One clipboard entry, as a row (list) or a tile (grid). Memoised: typing in search must not re-render hundreds of untouched rows. */
function CardBase(p: CardProps) {
  const { item, view, selected } = p; const mo = useMotion();
  const [dims, setDims] = useState("");
  const parts = describe(item, dims);
  const el = useRef<HTMLDivElement>(null);

  // Alt + drag hands the text or link to other apps (HTML5 drag-out). Plain drag is reserved for filing into collections (see useItemDrag).
  useEffect(() => {
    const n = el.current; if (!n) return;
    const start = (e: DragEvent) => { if (!e.dataTransfer) return; e.dataTransfer.setData("text/plain", item.content); e.dataTransfer.effectAllowed = "copy"; };
    const down = (e: PointerEvent) => { n.draggable = e.altKey && (item.kind === "text" || item.kind === "url"); };
    n.addEventListener("dragstart", start); n.addEventListener("pointerdown", down, true);
    return () => { n.removeEventListener("dragstart", start); n.removeEventListener("pointerdown", down, true); };
  }, [item.content, item.kind]);

  const media: ReactNode = item.kind === "image"
    ? <img src={imageSrc(item)} alt="" loading="lazy" draggable={false} onLoad={(e) => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} />
    : null;

  const flags = <>{item.pinned && <span className="flag pin" title="Pinned"><Icon name="pin" size={12} /></span>}{item.favorite && <span className="flag fav" title="Favourite"><Icon name="star" size={12} fill /></span>}</>;
  const tags = item.tags.length > 0 && <div className="tags">{item.tags.map((t) => <button key={t} className="tag" onClick={(e) => { e.stopPropagation(); p.onTag(t); }}>#{t}</button>)}</div>;
  const check = <button className="check" role="checkbox" aria-checked={selected} aria-label={`Select ${item.title}`} tabIndex={-1} onClick={(e) => { e.stopPropagation(); p.onToggleSelect(item, e); }} onDoubleClick={(e) => e.stopPropagation()}><i><Icon name="check" size={12} /></i></button>;
  const subline = parts.sub.length > 0 && <div className={`sub ${item.kind === "text" && parts.mono ? "mono" : ""}`}>{parts.sub.map((s, n) => <span key={n}>{s}</span>)}</div>;

  const shared = {
    ref: el, className: "card", role: "listitem", tabIndex: p.tabbable ? 0 : -1, "aria-label": `${item.kind}: ${item.title}`, "data-kind": item.kind, "data-view": view, "data-id": item.id,
    "data-selected": selected, "data-pinned": item.pinned, "data-drag": p.dragging || undefined,
    onClick: (e: React.MouseEvent) => p.onActivate(item, e), onDoubleClick: () => p.onOpen(item), onPointerDown: (e: React.PointerEvent) => p.onPointerDown(item, e),
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); p.onMenu(item, e.clientX, e.clientY, false); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter") { e.preventDefault(); p.onActivate(item, e); }
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); p.onMenu(item, r.left + 24, r.top + 24, true); }
    },
    layout: p.animate ? ("position" as const) : false,
    initial: p.animate ? { opacity: 0, y: -6 } : false, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, transition: mo.fade }, transition: mo.spring,
  };
  const moreBtn = <button className="icon-btn" aria-label="More actions" title="More actions" aria-haspopup="menu" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); p.onMenu(item, r.right, r.bottom + 4, false); }} onDoubleClick={(e) => e.stopPropagation()}><Icon name="more" /></button>;
  const acts = <div className="acts">
    <button className="icon-btn" aria-pressed={item.pinned} aria-label={item.pinned ? "Unpin" : "Pin"} title={item.pinned ? "Unpin (P)" : "Pin (P)"} onClick={(e) => { e.stopPropagation(); p.onPin(item); }} onDoubleClick={(e) => e.stopPropagation()}><Icon name={item.pinned ? "unpin" : "pin"} /></button>
    <button className="icon-btn" aria-pressed={item.favorite} aria-label={item.favorite ? "Remove favourite" : "Favourite"} title={item.favorite ? "Remove favourite (F)" : "Favourite (F)"} onClick={(e) => { e.stopPropagation(); p.onFav(item); }} onDoubleClick={(e) => e.stopPropagation()}><Icon name="star" fill={item.favorite} /></button>
    {moreBtn}</div>;

  if (view === "grid") {
    return (
      <m.div {...shared}>
        <div className="thumb">
          {media ?? (item.kind === "text" ? <p className={`snippet ${parts.mono ? "mono" : ""}`}>{parts.thumbText}</p>
            : <div className="glyph"><Icon name={parts.icon} size={28} />{parts.ext && <b>{parts.ext}</b>}</div>)}
          {(item.pinned || item.favorite) && <div className="flags">{item.pinned && <span className="flag pin" title="Pinned"><Icon name="pin" size={12} /></span>}{item.favorite && <span className="flag fav" title="Favourite"><Icon name="star" size={12} fill /></span>}</div>}
          {p.copied && <div className="done"><Icon name="check" size={22} /></div>}
        </div>
        {check}
        <div className="body"><div className={`title-line ${item.kind === "text" && parts.mono ? "mono" : ""}`} title={item.title}>{parts.title}</div>{subline}{tags}</div>
      </m.div>
    );
  }
  return (
    <m.div {...shared}>
      <div className="tile" data-has-ext={!!parts.ext && item.kind !== "image"}>
        {media ?? <Icon name={parts.icon} size={item.kind === "folder" ? 18 : 17} />}
        {!media && parts.ext && <span className="ext">{parts.ext}</span>}
        {p.copied && <span className="done"><Icon name="check" size={18} /></span>}
        {check}
      </div>
      <div className="body">
        <div className={`title-line ${item.kind === "text" && parts.mono ? "mono" : ""}`} title={item.title}>{parts.title}</div>
        {subline}{tags}
      </div>
      <div className="aside"><span className="when">{flags}{formatAgo(item.capturedAt, p.now)}</span>{acts}</div>
    </m.div>
  );
}
export const ItemCard = memo(CardBase);
