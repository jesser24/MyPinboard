import { useEffect, useRef } from "react";
import type { PinItem } from "../lib/types";
import { formatAgo, formatSize } from "../lib/capture";
import { looksLikeCode } from "../lib/links";
import { Icon, Modal } from "./Ui";

/** Read-only full view of an item: the whole text, the whole link, or every path in a group. Images use the lightbox instead. */
export function ItemViewer({ item, collectionName, onCopy, onEdit, onOpen, onClose }: { item: PinItem; collectionName?: string; onCopy(): void; onEdit(): void; onOpen(): void; onClose(): void }) {
  const copy = useRef<HTMLButtonElement>(null);
  useEffect(() => { copy.current?.focus(); }, []);
  const mono = item.kind === "text" ? looksLikeCode(item.content) : item.kind !== "url";
  return (
    <Modal label={`View ${item.title}`} onClose={onClose} className="wide">
      <h3 title={item.title} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</h3>
      <pre className={`viewer-text ${mono ? "mono" : ""}`} tabIndex={0}>{item.content}</pre>
      <div className="viewer-meta">
        <span>{item.kind === "group" ? `${item.content.split("\n").length} files` : item.kind}</span>
        {item.sizeBytes != null && <span>{formatSize(item.sizeBytes)}</span>}
        <span>{formatAgo(item.capturedAt)}</span>{collectionName && <span>{collectionName}</span>}{item.sourceApp && <span>{item.sourceApp}</span>}
      </div>
      <div className="row end">
        <button className="btn" onClick={onClose}>Close</button>
        {item.kind === "text" && <button className="btn" onClick={onEdit}><Icon name="edit" />Edit</button>}
        {item.kind === "url" && <button className="btn" onClick={onOpen}><Icon name="open" />Open link</button>}
        <button ref={copy} className="btn primary" onClick={onCopy}><Icon name="copy" />Copy</button>
      </div>
    </Modal>
  );
}
