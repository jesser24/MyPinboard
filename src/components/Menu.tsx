import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { m } from "motion/react";
import { Icon, type IconName } from "./Ui";
import { popVariants, useMotion } from "./Motion";

export type MenuEntry =
  | "sep"
  | { head: string }
  | { label: string; icon?: IconName; dot?: string; shortcut?: string; danger?: boolean; disabled?: boolean; checked?: boolean; run?: () => void; submenu?: MenuEntry[] };

/**
 * A floating menu anchored at a point (right-click, button, or keyboard). Sub-menus replace the panel with a "back" entry, which works at any width.
 * Keyboard: Up/Down/Home/End move, Enter/Space activate, Escape or Left closes one level. Rendered inside <AnimatePresence> by the caller.
 */
export function Menu({ x, y, entries, onClose, focusFirst = false, label = "Menu" }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void; focusFirst?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null); const p = useMotion();
  const [pos, setPos] = useState({ x, y, ox: 0, oy: 0 }); const [stack, setStack] = useState<{ title: string; entries: MenuEntry[] }[]>([]);
  const level = stack.length ? stack[stack.length - 1].entries : entries;

  // Keep the panel on screen and make it grow from the point it was opened at.
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    const nx = Math.max(8, Math.min(x, innerWidth - r.width - 8)); const ny = Math.max(8, Math.min(y, innerHeight - r.height - 8));
    setPos({ x: nx, y: ny, ox: x - nx, oy: y - ny });
  }, [x, y, stack.length]);
  const items = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
  useEffect(() => { if (focusFirst) items()[0]?.focus(); else ref.current?.focus(); }, [focusFirst, stack.length]);

  const onKey = (e: React.KeyboardEvent) => {
    const list = items(); const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(at + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); } else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === "ArrowLeft" && stack.length) { e.preventDefault(); setStack(stack.slice(0, -1)); }
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); } }; addEventListener("keydown", k, true); return () => removeEventListener("keydown", k, true); }, [onClose]);

  const choose = (en: Exclude<MenuEntry, "sep" | { head: string }>) => {
    if (en.submenu) { setStack([...stack, { title: en.label, entries: en.submenu }]); return; }
    onClose(); en.run?.();
  };

  return createPortal(
    <div className="menu-scrim" onPointerDown={(e) => { e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <m.div ref={ref} className="menu" role="menu" aria-label={label} tabIndex={-1} style={{ left: pos.x, top: pos.y, transformOrigin: `${pos.ox}px ${pos.oy}px` }}
        variants={popVariants} initial="hidden" animate="shown" exit="gone" transition={p.pop} onPointerDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        {stack.length > 0 && <button role="menuitem" className="back" onClick={() => setStack(stack.slice(0, -1))}><Icon name="back" /><span>{stack[stack.length - 1].title}</span></button>}
        {level.map((en, n) => en === "sep" ? <hr key={n} /> : "head" in en ? <div key={n} className="sub-head">{en.head}</div> : (
          <button key={n} role={en.checked !== undefined ? "menuitemradio" : "menuitem"} aria-checked={en.checked} disabled={en.disabled} className={en.danger ? "danger" : ""} onClick={() => choose(en)}>
            {en.dot ? <i className="col-dot" style={{ background: en.dot }} /> : en.checked !== undefined ? <span style={{ flex: "none", width: 16, display: "grid", placeItems: "center" }}>{en.checked && <Icon name="check" />}</span> : en.icon ? <Icon name={en.icon} /> : null}
            <span>{en.label}</span>{en.shortcut && <kbd>{en.shortcut}</kbd>}{en.submenu && <Icon name="forward" size={14} />}
          </button>))}
      </m.div>
    </div>, document.body);
}
