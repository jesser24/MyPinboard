import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { m } from "motion/react";
import {
  AlignLeft, ArrowDownUp, Check, ChevronLeft, ChevronRight, Clock, Code, Command, Copy, CornerDownLeft, Ellipsis, ExternalLink, Eye, File, FileText, Folder, FolderInput,
  GripVertical, HardDrive, Image, Inbox, Info, Keyboard, LayoutGrid, Link2, List, Palette, PanelLeft, PanelLeftClose, CirclePause, CirclePlay, Pencil, Pin, PinOff, Plus, Search,
  Settings, ShieldCheck, SlidersHorizontal, Star, Tag, Trash2, X, Rows3, Layers, Sparkles, type LucideIcon,
} from "lucide-react";
import { popVariants, useMotion } from "./Motion";

/** The single icon family (Lucide: 24px grid, 1.75 stroke, round caps). Every icon in the app goes through <Icon>. */
const ICONS = {
  all: Inbox, text: AlignLeft, code: Code, link: Link2, image: Image, file: File, fileText: FileText, folder: Folder, star: Star, pin: Pin, unpin: PinOff,
  search: Search, settings: Settings, close: X, pause: CirclePause, play: CirclePlay, grip: GripVertical, back: ChevronLeft, forward: ChevronRight, check: Check, plus: Plus,
  copy: Copy, edit: Pencil, trash: Trash2, move: FolderInput, open: ExternalLink, eye: Eye, tag: Tag, more: Ellipsis, command: Command, enter: CornerDownLeft,
  list: List, rows: Rows3, grid: LayoutGrid, sort: ArrowDownUp, filter: SlidersHorizontal, clock: Clock, sidebar: PanelLeft, sidebarClose: PanelLeftClose,
  palette: Palette, storage: HardDrive, privacy: ShieldCheck, about: Info, keyboard: Keyboard, layers: Layers, sparkle: Sparkles,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, fill }: { name: IconName; size?: number; fill?: boolean }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={1.75} aria-hidden focusable={false} fill={fill ? "currentColor" : "none"} />;
}

/** Shared dialog frame: dimmed backdrop, centred panel, fade + small scale. Rendered inside <AnimatePresence> by the caller. */
export function Modal({ children, onClose, label, className = "" }: { children: ReactNode; onClose: () => void; label: string; className?: string }) {
  const p = useMotion();
  return createPortal(
    <m.div className="modal-scrim" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={p.fade}>
      <m.div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} variants={popVariants} initial="hidden" animate="shown" exit="gone" transition={p.pop}>
        {children}
      </m.div>
    </m.div>, document.body);
}

export function Prompt({ title, initial = "", placeholder, multiline, action = "Save", onSubmit, onCancel }:
  { title: string; initial?: string; placeholder?: string; multiline?: boolean; action?: string; onSubmit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial); const r = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { r.current?.focus(); r.current?.select(); }, []);
  return (
    <Modal label={title} onClose={onCancel}>
      <h3>{title}</h3>
      {multiline ? <textarea ref={r} value={v} onChange={(e) => setV(e.target.value)} rows={8} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSubmit(v); }} />
        : <input ref={r} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSubmit(v); }} />}
      <div className="row end"><button className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" onClick={() => onSubmit(v)}>{action}</button></div>
    </Modal>
  );
}

export function Confirm({ title, body, action, onYes, onNo }: { title: string; body: string; action: string; onYes: () => void; onNo: () => void }) {
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => { yes.current?.focus(); }, []);
  return (
    <Modal label={title} onClose={onNo}>
      <h3>{title}</h3><p className="muted">{body}</p>
      <div className="row end"><button className="btn" onClick={onNo}>Cancel</button><button ref={yes} className="btn danger solid" onClick={onYes}>{action}</button></div>
    </Modal>
  );
}
