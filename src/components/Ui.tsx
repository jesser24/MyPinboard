import { useEffect, useRef, useState, type ReactNode } from "react";

export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
export const P = {
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3", gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  pin: "M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7z", star: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z", x: "M18 6L6 18M6 6l12 12",
  pause: "M10 5v14M16 5v14", play: "M7 4l12 8-12 8z", file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5", folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1", text: "M4 6h16M4 12h16M4 18h10", image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  back: "M15 18l-6-6 6-6", grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
};

export function Prompt({ title, initial = "", placeholder, multiline, onSubmit, onCancel }: { title: string; initial?: string; placeholder?: string; multiline?: boolean; onSubmit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial); const r = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { r.current?.focus(); r.current?.select(); }, []);
  return (
    <div className="modal-scrim" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {multiline ? <textarea ref={r} value={v} onChange={(e) => setV(e.target.value)} rows={8} />
          : <input ref={r} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSubmit(v); }} />}
        <div className="row end"><button className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" onClick={() => onSubmit(v)}>Save</button></div>
      </div>
    </div>
  );
}
export function Confirm({ title, body, action, onYes, onNo }: { title: string; body: string; action: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="modal-scrim" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onNo(); }}>
      <div className="modal" role="alertdialog" aria-label={title}><h3>{title}</h3><p className="muted">{body}</p>
        <div className="row end"><button className="btn" onClick={onNo}>Cancel</button><button className="btn danger" onClick={onYes}>{action}</button></div></div>
    </div>
  );
}
export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="modal-scrim" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>{children}</div>;
}
