import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { m } from "motion/react";
import type { PinItem } from "../lib/types";
import { rank, score, type Command } from "../lib/palette";
import { Icon, type IconName } from "./Ui";
import { popVariants, useMotion } from "./Motion";

const KIND_ICON: Record<PinItem["kind"], IconName> = { text: "text", url: "link", image: "image", file: "file", group: "file", folder: "folder" };

interface Row { key: string; group: string; title: string; hint?: string; shortcut?: string; icon: IconName; run: () => void }

/**
 * Raycast-style palette (Ctrl+K). One input searches commands and clipboard items together. Enter runs the highlighted row; for an item that copies it.
 * Items are only searched once something is typed, so the empty palette stays a short, scannable list of commands.
 */
export function CommandPalette({ commands, items, onCopyItem, onClose }: { commands: Command[]; items: PinItem[]; onCopyItem(i: PinItem): void; onClose(): void }) {
  const p = useMotion(); const [q, setQ] = useState(""); const [at, setAt] = useState(0); const input = useRef<HTMLInputElement>(null); const list = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const rows = useMemo<Row[]>(() => {
    const cmd: Row[] = rank(commands, q, 12).map((c) => ({ key: c.id, group: c.group, title: c.title, hint: c.hint, shortcut: c.shortcut, icon: ICON_FOR[c.group] ?? "command", run: c.run }));
    if (!q.trim()) return cmd;
    const hits = items.map((i) => ({ i, s: Math.max(score(q, i.title), score(q, i.content.slice(0, 400)) * 0.7) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6)
      .map<Row>(({ i }) => ({ key: `item-${i.id}`, group: "Clipboard", title: i.title, hint: "Copy", icon: KIND_ICON[i.kind], run: () => onCopyItem(i) }));
    return [...cmd, ...hits];
  }, [commands, items, q, onCopyItem]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [at]);

  const run = (r?: Row) => { if (!r) return; onClose(); r.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(rows[at]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  let last = "";
  return createPortal(
    <m.div className="palette-scrim" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={p.fade}>
      <m.div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" variants={popVariants} initial="hidden" animate="shown" exit="gone" transition={p.pop} onKeyDown={onKey}>
        <div className="palette-input"><Icon name="command" size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items or run a command…" role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={rows[at] ? `pal-${rows[at].key}` : undefined} aria-label="Command palette" /></div>
        <div className="palette-list" id="palette-list" role="listbox" ref={list}>
          {rows.length === 0 && <div className="palette-empty">No commands or items match “{q}”.</div>}
          {rows.map((r, n) => {
            const head = r.group !== last ? <div className="palette-group" role="presentation">{r.group}</div> : null; last = r.group;
            return (<div key={r.key} role="presentation">{head}
              <button id={`pal-${r.key}`} role="option" aria-selected={n === at} className="palette-item" onMouseMove={() => setAt(n)} onClick={() => run(r)}>
                <Icon name={r.icon} /><span className="t">{r.title}</span>{r.hint && <span className="h">{r.hint}</span>}{r.shortcut && <kbd>{r.shortcut}</kbd>}
              </button></div>);
          })}
        </div>
        <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>
      </m.div>
    </m.div>, document.body);
}

const ICON_FOR: Record<string, IconName> = { Go: "forward", View: "list", Appearance: "palette", Actions: "sparkle", Clipboard: "copy" };
