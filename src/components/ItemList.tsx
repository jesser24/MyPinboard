import { useMemo, useRef, type ComponentProps } from "react";
import { AnimatePresence } from "motion/react";
import type { PinItem, SortKey } from "../lib/types";
import { groupItems } from "../lib/view";
import { ItemCard } from "./ItemCard";

/** Row/tile animation is cheap for a few dozen entries and wasteful for hundreds, so long lists switch it off. */
export const ANIMATE_UP_TO = 80;

type Handlers = Pick<ComponentProps<typeof ItemCard>, "onActivate" | "onOpen" | "onMenu" | "onToggleSelect" | "onTag" | "onFav" | "onPin" | "onPointerDown">;
interface Props extends Handlers {
  items: PinItem[]; sort: SortKey; view: "list" | "grid"; density: "comfortable" | "compact"; cols: number; now: number;
  selected: ReadonlySet<string>; activeId?: string; copiedId?: string; draggingIds?: readonly string[];
  /** Section key: changing it remounts the list so a section switch never plays hundreds of enter animations. */
  listKey: string;
}

/** Roving-tabindex list. Arrow keys move focus (Up/Down by row, Left/Right and column-aware Up/Down in the grid); Home/End jump. */
export function ItemList(p: Props) {
  const root = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupItems(p.items, p.sort, p.now), [p.items, p.sort, p.now]);
  const animate = p.items.length <= ANIMATE_UP_TO;
  const first = p.items[0]?.id; const tabId = p.activeId && p.items.some((i) => i.id === p.activeId) ? p.activeId : first;
  const dragging = p.draggingIds ?? [];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.target as HTMLElement).classList.contains("card")) return;
    const cards = Array.from(root.current?.querySelectorAll<HTMLElement>(".card") ?? []); const at = cards.indexOf(e.target as HTMLElement); let to = -1;
    const step = p.view === "grid" ? Math.max(1, p.cols) : 1;
    if (e.key === "ArrowDown") to = Math.min(cards.length - 1, at + step); else if (e.key === "ArrowUp") to = Math.max(0, at - step);
    else if (p.view === "grid" && e.key === "ArrowRight") to = Math.min(cards.length - 1, at + 1); else if (p.view === "grid" && e.key === "ArrowLeft") to = Math.max(0, at - 1);
    else if (e.key === "Home") to = 0; else if (e.key === "End") to = cards.length - 1;
    else if (e.key === "PageDown") to = Math.min(cards.length - 1, at + 8 * step); else if (e.key === "PageUp") to = Math.max(0, at - 8 * step);
    if (to >= 0) { e.preventDefault(); cards[to]?.focus(); cards[to]?.scrollIntoView({ block: "nearest" }); }
  };

  const card = (i: PinItem) => (
    <ItemCard key={i.id} item={i} view={p.view} selected={p.selected.has(i.id)} tabbable={i.id === tabId} copied={p.copiedId === i.id} dragging={dragging.includes(i.id)} animate={animate} now={p.now}
      onActivate={p.onActivate} onOpen={p.onOpen} onMenu={p.onMenu} onToggleSelect={p.onToggleSelect} onTag={p.onTag} onFav={p.onFav} onPin={p.onPin} onPointerDown={p.onPointerDown} />
  );
  const body = (list: PinItem[]) => animate
    ? <AnimatePresence initial={false}>{list.map(card)}</AnimatePresence> : list.map(card);

  return (
    <div className="list" ref={root} role="list" aria-label="Clipboard items" data-density={p.density} data-selecting={p.selected.size > 0} onKeyDown={onKeyDown} key={p.listKey}>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || undefined}>
          <div className="group-head">{g.label}</div>
          <div className={p.view === "grid" ? "tiles" : "rows"} style={p.view === "grid" ? { gridTemplateColumns: `repeat(${p.cols}, minmax(0, 1fr))` } : undefined}>{body(g.items)}</div>
        </section>
      ))}
    </div>
  );
}
