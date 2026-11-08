import { memo, useState } from "react";
import { m } from "motion/react";
import type { PinItem } from "../lib/types";
import { formatSize } from "../lib/capture";
import { fileInfo, looksLikeCode, shortenPath, splitUrl } from "../lib/links";
import { formatCaptured, formatFull } from "../lib/time";
import { imageSrc } from "../native/tauriBackend";
import { Icon, type IconName } from "./Ui";
import { useMotion } from "./Motion";

export interface PanelItemProps {
  item: PinItem; now: number; copied: boolean; tabbable: boolean; animate: boolean;
  onCopy(item: PinItem): void; onDelete(item: PinItem): void;
}

interface Parts { title: string; sub?: string; meta: string[]; icon: IconName; ext?: string; mono?: boolean }
function describe(i: PinItem, dims: string): Parts {
  const app = i.sourceApp ? [i.sourceApp] : [];
  switch (i.kind) {
    case "url": { const u = splitUrl(i.content); return { title: u.domain || i.title, sub: `${u.domain}${u.path}` === i.title ? undefined : (u.path || i.title), meta: app, icon: "link" }; }
    case "image": return { title: i.title, meta: [dims, formatSize(i.sizeBytes), ...app].filter(Boolean), icon: "image" };
    case "file": { const f = fileInfo(i.content); return { title: f.name || i.title, sub: f.dir ? shortenPath(f.dir, 40) : undefined, meta: [formatSize(i.sizeBytes), ...app].filter(Boolean), icon: "file", ext: f.ext || "FILE" }; }
    case "folder": return { title: i.title, sub: shortenPath(i.content, 44), meta: ["Folder", ...app], icon: "folder" };
    case "group": { const n = i.content.split("\n").filter(Boolean).length; return { title: i.title, meta: [`${n} files`, ...app], icon: "file", ext: "×" + n }; }
    default: { const t = i.content.replace(/\s+/g, " ").trim(); const n = [...i.content].length;
      return { title: t.slice(0, 200) || i.title, meta: [`${n.toLocaleString()} ${n === 1 ? "char" : "chars"}`, ...app], icon: looksLikeCode(i.content) ? "code" : "text", mono: looksLikeCode(i.content) }; }
  }
}

/** One clipboard entry in the floating panel. Click copies it; the trash button (top-right) deletes it immediately, with Undo handled by the panel. */
function Base(p: PanelItemProps) {
  const { item } = p; const mo = useMotion(); const [dims, setDims] = useState("");
  const d = describe(item, dims);
  const when = formatCaptured(item.capturedAt, p.now);
  const isImg = item.kind === "image";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <m.div className="pi" role="listitem" tabIndex={p.tabbable ? 0 : -1} data-id={item.id} data-kind={item.kind} data-pinned={item.pinned} aria-label={`${item.kind}: ${d.title}`}
      onClick={() => p.onCopy(item)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onCopy(item); }
        else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); p.onDelete(item); }
      }}
      layout={p.animate ? "position" : false} initial={p.animate ? { opacity: 0, y: -6 } : false} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 28, transition: mo.fade }} transition={mo.spring}>
      {!isImg && (
        <div className="pi-tile" data-ext={!!d.ext}>
          <Icon name={d.icon} size={d.ext ? 16 : 17} />{d.ext && <span className="ext">{d.ext}</span>}
          {p.copied && <span className="done"><Icon name="check" size={18} /></span>}
        </div>
      )}
      <div className="pi-body">
        {isImg
          ? <div className="pi-img"><img src={imageSrc(item)} alt="" loading="lazy" draggable={false} onLoad={(e) => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} />{p.copied && <span className="done"><Icon name="check" size={22} /></span>}</div>
          : <div className={`pi-title ${d.mono ? "mono" : ""} ${item.kind === "text" ? "wrap" : ""}`} title={item.kind === "text" ? undefined : d.title}>{d.title}</div>}
        {d.sub && <div className="pi-sub" title={d.sub}>{d.sub}</div>}
        <div className="pi-meta">
          {item.pinned && <span className="pi-pin" title="Pinned"><Icon name="pin" size={11} /></span>}
          <time dateTime={new Date(item.capturedAt).toISOString()} title={formatFull(item.capturedAt)}>{when}</time>
          {d.meta.map((x, n) => <span key={n} className="dim">{x}</span>)}
        </div>
      </div>
      <button className="pi-del" aria-label={`Delete ${d.title.slice(0, 40)}`} title="Delete (Del)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); p.onDelete(item); }} onDoubleClick={stop}><Icon name="trash" size={15} /></button>
    </m.div>
  );
}
export const PanelItem = memo(Base);
