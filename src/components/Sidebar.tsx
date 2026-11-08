import { m } from "motion/react";
import type { Collection } from "../lib/types";
import { collectionSection, SECTION_LABEL, TYPE_SECTIONS, type SectionId } from "../lib/view";
import { Icon, type IconName } from "./Ui";
import { useMotion } from "./Motion";

export type SidebarMode = "rail" | "full" | "drawer";
export type Place = SectionId | "settings";

const LIBRARY: { id: SectionId; icon: IconName }[] = [{ id: "all", icon: "all" }, { id: "favorites", icon: "star" }, { id: "pinned", icon: "pin" }];
const TYPE_ICON: Record<(typeof TYPE_SECTIONS)[number], IconName> = { text: "text", links: "link", images: "image", files: "file", folders: "folder" };

interface Props {
  mode: SidebarMode; place: Place; counts: Record<string, number>; collections: Collection[]; hotCollection?: string;
  onPlace(p: Place): void; onToggle(): void; onNewCollection(): void; onCollectionMenu(c: Collection, x: number, y: number): void;
}

function NavButton({ id, icon, label, count, current, onPick, title, dot, hot, dropId }: {
  id: string; icon?: IconName; label: string; count?: number; current: boolean; onPick(): void; title?: string; dot?: string; hot?: boolean; dropId?: string }) {
  const p = useMotion();
  return (
    <button className="nav-item" aria-current={current} title={title ?? label} onClick={onPick} data-drop={hot ? "hot" : undefined} data-drop-collection={dropId} data-nav={id}>
      {current && <m.span layoutId="nav-pill" className="nav-pill" transition={p.spring} />}
      {dot ? <i className="col-dot" style={{ background: dot }} /> : icon && <Icon name={icon} />}
      <span className="nav-label">{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );
}

export function Sidebar({ mode, place, counts, collections, hotCollection, onPlace, onToggle, onNewCollection, onCollectionMenu }: Props) {
  const compact = mode === "rail";
  return (
    <nav className="side" data-mode={mode} aria-label="Navigation">
      <div className="side-scroll">
        <div className="side-brand" title="MyPinboard"><Icon name="pin" size={18} />{!compact && <span>MyPinboard</span>}</div>
        {LIBRARY.map((n) => <NavButton key={n.id} id={n.id} icon={n.icon} label={SECTION_LABEL[n.id as keyof typeof SECTION_LABEL]} count={counts[n.id]} current={place === n.id} onPick={() => onPlace(n.id)} />)}

        <div className="nav-head"><span>Types</span></div>
        {TYPE_SECTIONS.map((t) => <NavButton key={t} id={t} icon={TYPE_ICON[t]} label={SECTION_LABEL[t]} count={counts[t]} current={place === t} onPick={() => onPlace(t)} />)}

        <div className="nav-head"><span>Collections</span>
          {!compact && <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label="New collection" title="New collection" onClick={onNewCollection}><Icon name="plus" size={14} /></button>}
        </div>
        {collections.map((c) => {
          const id = collectionSection(c.id);
          return (
            <div className="nav-row" key={c.id} onContextMenu={(e) => { e.preventDefault(); onCollectionMenu(c, e.clientX, e.clientY); }}
              onKeyDown={(e) => { if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); onCollectionMenu(c, r.left + 24, r.bottom); } }}>
              <NavButton id={id} dot={c.color} label={c.name} count={counts[id]} current={place === id} hot={hotCollection === c.id} dropId={c.id} onPick={() => onPlace(id)} title={`${c.name} — drop items here to file them`} />
              <button className="nav-more" aria-label={`Collection options for ${c.name}`} aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onCollectionMenu(c, r.left, r.bottom + 4); }}><Icon name="more" size={14} /></button>
            </div>
          );
        })}
        {compact && <button className="nav-item" aria-label="New collection" title="New collection" onClick={onNewCollection}><Icon name="plus" /></button>}
      </div>
      <div className="side-foot">
        <NavButton id="settings" icon="settings" label="Settings" current={place === "settings"} onPick={() => onPlace("settings")} title="Settings (Ctrl+,)" />
        <button className="nav-item" onClick={onToggle} title={mode === "full" ? "Collapse sidebar" : "Expand sidebar"} aria-label={mode === "full" ? "Collapse sidebar" : "Expand sidebar"}>
          <Icon name={mode === "full" || mode === "drawer" ? "sidebarClose" : "sidebar"} /><span className="nav-label">Collapse</span>
        </button>
      </div>
    </nav>
  );
}
