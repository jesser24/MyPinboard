import { m } from "motion/react";
import { Icon } from "./Ui";
import { useMotion } from "./Motion";

/** Bulk actions for the current multi-selection. Floats above the list so the list never has to reflow. */
export function SelectionBar({ count, allFavourite, allPinned, onFav, onPin, onMove, onRemove, onClear }: {
  count: number; allFavourite: boolean; allPinned: boolean; onFav(): void; onPin(): void; onMove(x: number, y: number): void; onRemove(): void; onClear(): void }) {
  const p = useMotion();
  return (
    <m.div className="selbar" role="toolbar" aria-label="Selected items" initial={{ opacity: 0, y: 14, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: 14, x: "-50%", transition: p.fade }} transition={p.spring}>
      <span className="count" aria-live="polite">{count} selected</span>
      <span className="sep" />
      <button className="icon-btn" aria-pressed={allFavourite} aria-label={allFavourite ? "Remove favourite from selected" : "Favourite selected"} title={allFavourite ? "Remove favourite (F)" : "Favourite (F)"} onClick={onFav}><Icon name="star" fill={allFavourite} /></button>
      <button className="icon-btn" aria-pressed={allPinned} aria-label={allPinned ? "Unpin selected" : "Pin selected"} title={allPinned ? "Unpin (P)" : "Pin (P)"} onClick={onPin}><Icon name={allPinned ? "unpin" : "pin"} /></button>
      <button className="icon-btn" aria-label="Move selected to collection" aria-haspopup="menu" title="Move to collection" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMove(r.left, r.top - 8); }}><Icon name="move" /></button>
      <button className="icon-btn danger" aria-label="Remove selected" title="Remove (Del)" onClick={onRemove}><Icon name="trash" /></button>
      <span className="sep" />
      <button className="icon-btn" aria-label="Clear selection" title="Clear selection (Esc)" onClick={onClear}><Icon name="close" /></button>
    </m.div>
  );
}
