import type { PinItem } from "../lib/types";
import { formatAgo, formatSize } from "../lib/capture";
import { Icon, P } from "./Ui";
import { imageSrc } from "../native/tauriBackend";

const KIND_ICON = { text: P.text, url: P.link, image: P.image, file: P.file, group: P.file, folder: P.folder } as const;
export const extOf = (i: PinItem) => (i.kind === "file" ? (i.title.split(".").length > 1 ? i.title.split(".").pop()!.slice(0, 5).toUpperCase() : "FILE") : i.kind === "group" ? "×N" : "");
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

export function Card({ item, density, onCopy, onOpen, onMenu, onTag }: { item: PinItem; density: string; onCopy: () => void; onOpen: () => void; onMenu: (x: number, y: number) => void; onTag: (t: string) => void }) {
  const ext = extOf(item);
  return (
    <article className="card" data-kind={item.kind} data-density={density} tabIndex={0} draggable={item.kind === "text" || item.kind === "url"}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", item.content); e.dataTransfer.effectAllowed = "copy"; }}
      onClick={onCopy} onDoubleClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}
      onKeyDown={(e) => { if (e.key === "Enter") onCopy(); if (e.key === " " || e.key === "ContextMenu") { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); onMenu(r.left + 20, r.top + 20); } }}
      aria-label={`${item.kind}: ${item.title}`}>
      <div className="thumb">
        {item.kind === "image" ? <img src={imageSrc(item)} alt="" loading="lazy" draggable={false} />
          : item.kind === "text" ? <p className="snippet">{item.content.slice(0, 220)}</p>
          : <div className="glyph" style={ext ? { ["--h" as string]: hue(ext) } : undefined}><Icon d={KIND_ICON[item.kind]} size={28} />{ext && <b>{ext}</b>}</div>}
        <div className="flags">{item.pinned && <span title="Pinned"><Icon d={P.pin} size={12} /></span>}{item.favorite && <span title="Favourite" className="fav"><Icon d={P.star} size={12} /></span>}</div>
      </div>
      <div className="meta">
        <div className="title" title={item.title}>{item.title}</div>
        <div className="sub">{[item.kind, formatSize(item.sizeBytes), formatAgo(item.capturedAt), item.sourceApp].filter(Boolean).join(" · ")}</div>
        {item.tags.length > 0 && <div className="tags">{item.tags.map((t) => <button key={t} className="tag" onClick={(e) => { e.stopPropagation(); onTag(t); }}>#{t}</button>)}</div>}
      </div>
    </article>
  );
}
