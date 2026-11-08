import { useCallback, useEffect, useMemo, useRef, useState, type PointerEventHandler } from "react";
import { AnimatePresence } from "motion/react";
import type { Collection, DateRange, PinItem, SortKey } from "../lib/types";
import { runQuery } from "../lib/search";
import type { Store } from "../lib/store";
import { pruneSelection, rangeIds, toggleId } from "../lib/selection";
import { collectionOf, collectionSection, DATE_LABEL, queryFor, sectionCounts, sectionTitle, SORT_LABEL, type SectionId } from "../lib/view";
import { emptyFor } from "../lib/empty";
import { useDebounced, useElementWidth, useItemDrag } from "../lib/hooks";
import { ACCENTS, type Accent } from "../lib/settings";
import type { Command } from "../lib/palette";
import { baseFontPx } from "../lib/layout";
import { imageSrc } from "../native/tauriBackend";
import { itemMenu } from "./ContextMenu";
import { Menu, type MenuEntry } from "./Menu";
import { Sidebar, type Place, type SidebarMode } from "./Sidebar";
import { ItemList } from "./ItemList";
import { SelectionBar } from "./SelectionBar";
import { CommandPalette } from "./CommandPalette";
import { ItemViewer } from "./ItemViewer";
import { EmptyState, ErrorState } from "./EmptyState";
import { SettingsPanel } from "./SettingsPanel";
import { Confirm, Icon, Modal, Prompt } from "./Ui";

type Dialog =
  | { t: "rename" | "tag" | "edit" | "view" | "remove" | "image"; item: PinItem } | { t: "newcol" } | { t: "renamecol" | "delcol"; col: Collection } | { t: "bulkremove" } | null;
type MenuState = { x: number; y: number; entries: MenuEntry[]; kb: boolean; label: string } | null;

const NARROW = 560;
const isField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]");
const toast = (m: string) => window.dispatchEvent(new CustomEvent("pb-toast", { detail: m }));

interface Props { store: Store; width: number; dropping: boolean; onClose: () => void; gripProps: { onPointerDown: PointerEventHandler }; searchTick: number }

export function Board(props: Props) {
  const { store } = props;
  if (!store.snap) return <div className="board-inner">{store.error ? <ErrorState message={store.error} onRetry={store.retry} /> : <div className="loading" role="status">Loading…</div>}</div>;
  return <BoardView {...props} />;
}

function BoardView({ store, width, dropping, onClose, gripProps, searchTick }: Props) {
  const snap = store.snap!; const { patchItem, patchMany, remove, copy, setSettings } = store; const s = snap.settings;
  const items = snap.items; const collections = snap.collections;

  const [place, setPlace] = useState<Place>("all"); const [lastSection, setLastSection] = useState<SectionId>("all");
  const [text, setText] = useState(""); const q = useDebounced(text, 120);
  const [sort, setSort] = useState<SortKey>("recent"); const [date, setDate] = useState<DateRange>("any"); const [tag, setTag] = useState<string | undefined>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set()); const anchor = useRef<string | undefined>();
  const [activeId, setActiveId] = useState<string | undefined>(); const [copiedId, setCopiedId] = useState<string | undefined>();
  const [menu, setMenu] = useState<MenuState>(null); const [dialog, setDialog] = useState<Dialog>(null); const [palette, setPalette] = useState(false); const [zoom, setZoom] = useState(false);
  const [drawer, setDrawer] = useState(false); const [now, setNow] = useState(Date.now());
  const search = useRef<HTMLInputElement>(null); const listBox = useRef<HTMLDivElement>(null); const listWidth = useElementWidth(listBox);

  const narrow = width < NARROW;
  const sbMode: SidebarMode = narrow ? "rail" : s.sidebarCollapsed ? "rail" : "full";
  const section: SectionId = place === "settings" ? lastSection : place;
  const inSettings = place === "settings";
  const names = useMemo(() => new Map(collections.map((c) => [c.id, c.name])), [collections]);
  const counts = useMemo(() => sectionCounts(items, collections), [items, collections]);
  const shown = useMemo(() => runQuery(items, queryFor({ section, text: q, date, sort, tag }, now), names), [items, section, q, date, sort, tag, names, now]);
  const order = useMemo(() => shown.map((i) => i.id), [shown]);
  const paused = !s.capture.enabled; const filtered = !!(q.trim() || date !== "any" || tag);
  const cols = Math.max(1, Math.floor((listWidth - 12 + 10) / ((s.rowDensity === "compact" ? 140 : 164) + 10)));

  // timestamps refresh once a minute; the interval is cleared on unmount
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  // drop selection of items that no longer exist; fall back when the open collection was deleted
  useEffect(() => { setSelected((cur) => pruneSelection(cur, new Set(items.map((i) => i.id)))); }, [items]);
  useEffect(() => { const c = collectionOf(section); if (c !== undefined && !collections.some((x) => x.id === c)) { setPlace("all"); setLastSection("all"); } }, [section, collections]);
  // opening the board (or Ctrl+F) focuses search on the list view
  useEffect(() => { setPlace((p) => (p === "settings" ? lastSection : p)); search.current?.focus(); search.current?.select(); }, [searchTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((p: Place) => { setPlace(p); if (p !== "settings") { setLastSection(p); setSelected(new Set()); setTag(undefined); } setDrawer(false); }, []);
  const clearSelection = useCallback(() => { setSelected(new Set()); anchor.current = undefined; }, []);

  // ---------- item actions ----------
  const flashCopied = (id: string) => { setCopiedId(id); window.setTimeout(() => setCopiedId((c) => (c === id ? undefined : c)), 900); };
  const doCopy = useCallback(async (i: PinItem) => { await copy(i); flashCopied(i.id); }, [copy]);
  const openItem = useCallback(async (i: PinItem) => {
    if (i.kind === "text") return setDialog({ t: "edit", item: i });
    if (i.kind === "image") return setDialog({ t: "image", item: i });
    try { if (!(await store.backend.openItem(i))) toast(i.kind === "url" ? "Opening links is available in the Windows app" : "Opening files is available in the Windows app"); } catch (e) { toast(String(e)); }
  }, [store.backend]);
  useEffect(() => {
    const f = (e: Event) => { const url = (e as CustomEvent<string>).detail; void store.backend.openItem({ id: "link", kind: "url", title: url, content: url, collectionId: "", tags: [], pinned: false, favorite: false, capturedAt: 0, hash: "" }).then((ok) => { if (!ok) window.open(url, "_blank", "noopener"); }); };
    addEventListener("pb-open-link", f); return () => removeEventListener("pb-open-link", f);
  }, [store.backend]);
  const reveal = async (i: PinItem) => { try { if (!(await store.backend.revealItem(i))) toast("Showing in Explorer is available in the Windows app"); } catch (e) { toast(String(e)); } };
  const move = (ids: string[], id: string) => { patchMany(ids, { collectionId: id }); toast(`Moved ${ids.length === 1 ? "1 item" : `${ids.length} items`} to ${names.get(id) ?? "collection"}`); };
  const byId = useCallback((id: string) => items.find((i) => i.id === id), [items]);

  const targetsFor = (i?: PinItem): PinItem[] => (selected.size ? [...selected].map(byId).filter((x): x is PinItem => !!x) : i ? [i] : []);
  const toggleFav = (ts: PinItem[]) => { const on = !ts.every((t) => t.favorite); patchMany(ts.map((t) => t.id), { favorite: on }); };
  const togglePin = (ts: PinItem[]) => { const on = !ts.every((t) => t.pinned); patchMany(ts.map((t) => t.id), { pinned: on }); };

  const moveEntries = (ids: string[]): MenuEntry[] => collections.map((c) => ({ label: c.name, dot: c.color, run: () => move(ids, c.id) }));
  const openMenu = useCallback((i: PinItem, x: number, y: number, kb: boolean) => {
    const sel = selected.has(i.id) && selected.size > 1;
    if (sel) {
      const ts = targetsFor(i); const ids = ts.map((t) => t.id);
      setMenu({ x, y, kb, label: "Selected items", entries: [
        { head: `${ts.length} items` },
        { label: ts.every((t) => t.favorite) ? "Remove favourite" : "Favourite", icon: "star", run: () => toggleFav(ts) },
        { label: ts.every((t) => t.pinned) ? "Unpin" : "Pin", icon: "pin", run: () => togglePin(ts) },
        { label: "Move to collection", icon: "move", submenu: moveEntries(ids) }, "sep", { label: "Remove from board", icon: "trash", danger: true, run: () => setDialog({ t: "bulkremove" }) }] });
      return;
    }
    setMenu({ x, y, kb, label: "Item actions", entries: itemMenu(i, collections, {
      copy: () => void doCopy(i), open: () => void openItem(i), view: () => setDialog({ t: "view", item: i }), edit: () => setDialog({ t: "edit", item: i }), rename: () => setDialog({ t: "rename", item: i }),
      tag: () => setDialog({ t: "tag", item: i }), pin: () => patchItem(i.id, { pinned: !i.pinned }), fav: () => patchItem(i.id, { favorite: !i.favorite }),
      move: (id) => move([i.id], id), reveal: () => void reveal(i), remove: () => setDialog({ t: "remove", item: i }) }) });
  }, [selected, collections, doCopy, openItem, patchItem, names]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- list handlers (stable identities so memoised rows stay memoised) ----------
  const latest = useRef({ selected, order, doCopy, openMenu, patchItem, move });
  latest.current = { selected, order, doCopy, openMenu, patchItem, move };
  const onActivate = useCallback((i: PinItem, e: React.MouseEvent | React.KeyboardEvent) => {
    const L = latest.current; setActiveId(i.id);
    if (e.shiftKey) { const ids = rangeIds(L.order, anchor.current, i.id); setSelected(new Set([...(e.ctrlKey || e.metaKey ? L.selected : []), ...ids])); if (!anchor.current) anchor.current = i.id; return; }
    if (e.ctrlKey || e.metaKey || L.selected.size > 0) { anchor.current = i.id; setSelected(toggleId(L.selected, i.id)); return; }
    anchor.current = i.id; void L.doCopy(i);
  }, []);
  const onToggleSelect = useCallback((i: PinItem, e: React.MouseEvent) => {
    const L = latest.current; setActiveId(i.id);
    if (e.shiftKey) { setSelected(new Set([...L.selected, ...rangeIds(L.order, anchor.current, i.id)])); return; }
    anchor.current = i.id; setSelected(toggleId(L.selected, i.id));
  }, []);
  const onMenu = useCallback((i: PinItem, x: number, y: number, kb: boolean) => latest.current.openMenu(i, x, y, kb), []);
  const onFav = useCallback((i: PinItem) => latest.current.patchItem(i.id, { favorite: !i.favorite }), []);
  const onPin = useCallback((i: PinItem) => latest.current.patchItem(i.id, { pinned: !i.pinned }), []);
  const onOpenItem = useCallback((i: PinItem) => void openItem(i), [openItem]);

  const { drag, begin, justDragged } = useItemDrag((ids, c) => latest.current.move(ids, c));
  const onPointerDown = useCallback((i: PinItem, e: React.PointerEvent) => { const L = latest.current; begin(e, L.selected.has(i.id) ? [...L.selected] : [i.id]); }, [begin]);
  const onActivateGuarded = useCallback((i: PinItem, e: React.MouseEvent | React.KeyboardEvent) => { if (justDragged()) return; onActivate(i, e); }, [justDragged, onActivate]);

  // ---------- keyboard ----------
  const layerOpen = !!(menu || dialog || palette);
  const kb = useRef({ layerOpen, selected, inSettings, text, drawer, onClose, shown });
  kb.current = { layerOpen, selected, inSettings, text, drawer, onClose, shown };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const c = kb.current;
      if (e.key === "Escape") {
        if (c.layerOpen && !(dialog)) return;                              // menu and palette close themselves
        if (dialog) { setDialog(null); return; }
        if (c.drawer) setDrawer(false); else if (c.selected.size) clearSelection(); else if (c.inSettings) setPlace(lastSection); else if (c.text) setText(""); else c.onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (!c.layerOpen) setPalette(true); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); if (!c.layerOpen) setPlace((p) => (p === "settings" ? lastSection : "settings")); return; }
      if (c.layerOpen || isField(e.target) || c.inSettings || e.altKey) return;
      const cardId = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(".card")?.dataset.id;
      const focused = cardId ? byId(cardId) : undefined;
      const ts = targetsFor(focused);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setSelected(new Set(c.shown.map((i) => i.id))); return; }
      if (e.ctrlKey || e.metaKey || !ts.length) return;
      if (e.key === "Delete") { e.preventDefault(); setDialog(ts.length > 1 ? { t: "bulkremove" } : { t: "remove", item: ts[0] }); }
      else if (e.key.toLowerCase() === "f") { e.preventDefault(); toggleFav(ts); }
      else if (e.key.toLowerCase() === "p") { e.preventDefault(); togglePin(ts); }
      else if (e.key === " " && focused && !c.selected.size) { e.preventDefault(); setDialog(focused.kind === "image" ? { t: "image", item: focused } : { t: "view", item: focused }); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }); // re-bound each render on purpose: it reads the latest state, and the listener is cheap

  // ---------- menus ----------
  const optionsMenu = (e: React.MouseEvent) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 220, y: r.bottom + 4, kb: false, label: "Sort and filter", entries: [
    { head: "Sort by" }, ...(Object.keys(SORT_LABEL) as SortKey[]).map<MenuEntry>((k) => ({ label: SORT_LABEL[k], checked: sort === k, run: () => setSort(k) })),
    "sep", { head: "Copied" }, ...(Object.keys(DATE_LABEL) as DateRange[]).map<MenuEntry>((k) => ({ label: DATE_LABEL[k], checked: date === k, run: () => setDate(k) }))] }); };
  const collectionMenu = (c: Collection, x: number, y: number) => setMenu({ x, y, kb: false, label: `${c.name} options`, entries: [
    { label: "Rename…", icon: "edit", run: () => setDialog({ t: "renamecol", col: c }) },
    { label: "Delete collection…", icon: "trash", danger: true, disabled: collections.length <= 1, run: () => setDialog({ t: "delcol", col: c }) }] });

  // ---------- command palette ----------
  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [];
    const nav = (id: SectionId, title: string, keywords = "") => out.push({ id: `go-${id}`, group: "Go", title: `Go to ${title}`, keywords, run: () => go(id) });
    nav("all", "All items", "home history"); nav("favorites", "Favourites", "starred"); nav("pinned", "Pinned");
    nav("text", "Text"); nav("links", "Links", "urls"); nav("images", "Images", "pictures photos"); nav("files", "Files", "documents"); nav("folders", "Folders", "directories");
    for (const c of collections) nav(collectionSection(c.id), c.name, "collection");
    for (const c of collections) {
      out.push({ id: `ren-${c.id}`, group: "Actions", title: `Rename collection “${c.name}”…`, keywords: "collection", run: () => setDialog({ t: "renamecol", col: c }) });
      if (collections.length > 1) out.push({ id: `del-${c.id}`, group: "Actions", title: `Delete collection “${c.name}”…`, keywords: "collection remove", run: () => setDialog({ t: "delcol", col: c }) });
    }
    out.push({ id: "settings", group: "Go", title: "Open settings", shortcut: "Ctrl ,", keywords: "preferences options", run: () => go("settings") });
    out.push({ id: "v-list", group: "View", title: "Show as list", hint: s.viewMode === "list" ? "Current" : undefined, run: () => setSettings({ viewMode: "list" }) });
    out.push({ id: "v-grid", group: "View", title: "Show as grid", hint: s.viewMode === "grid" ? "Current" : undefined, run: () => setSettings({ viewMode: "grid" }) });
    out.push({ id: "v-dense", group: "View", title: s.rowDensity === "compact" ? "Use comfortable density" : "Use compact density", run: () => setSettings({ rowDensity: s.rowDensity === "compact" ? "comfortable" : "compact" }) });
    if (!narrow) out.push({ id: "v-side", group: "View", title: s.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar", run: () => setSettings({ sidebarCollapsed: !s.sidebarCollapsed }) });
    for (const k of Object.keys(SORT_LABEL) as SortKey[]) out.push({ id: `sort-${k}`, group: "View", title: `Sort by ${SORT_LABEL[k].toLowerCase()}`, run: () => setSort(k) });
    for (const t of ["system", "dark", "light"] as const) out.push({ id: `theme-${t}`, group: "Appearance", title: `${t === "system" ? "Match system" : t[0].toUpperCase() + t.slice(1)} theme`, keywords: "colour color mode", hint: s.theme === t ? "Current" : undefined, run: () => setSettings({ theme: t }) });
    for (const a of Object.keys(ACCENTS) as Accent[]) out.push({ id: `accent-${a}`, group: "Appearance", title: `Accent: ${a[0].toUpperCase() + a.slice(1)}`, keywords: "colour color", hint: s.accent === a ? "Current" : undefined, run: () => setSettings({ accent: a }) });
    out.push({ id: "pause", group: "Actions", title: paused ? "Resume capture" : "Pause capture", keywords: "stop start record", run: () => setSettings({ capture: { ...s.capture, enabled: paused } }) });
    out.push({ id: "newcol", group: "Actions", title: "New collection…", keywords: "create folder", run: () => setDialog({ t: "newcol" }) });
    out.push({ id: "search", group: "Actions", title: "Focus search", shortcut: "Ctrl F", run: () => { go(lastSection); window.setTimeout(() => search.current?.focus(), 30); } });
    return out;
  }, [collections, s, paused, narrow, go, lastSection, setSettings]);

  // ---------- empty state ----------
  const empty = emptyFor({ section, collections, hasItems: items.length > 0, text: q, date, paused });
  const onEmptyAction = (id: "clear-search" | "clear-date" | "resume") => { if (id === "clear-search") { setText(""); search.current?.focus(); } else if (id === "clear-date") setDate("any"); else setSettings({ capture: { ...s.capture, enabled: true } }); };

  const sel = [...selected].map(byId).filter((x): x is PinItem => !!x);
  const title = inSettings ? "Settings" : sectionTitle(section, collections);
  const toggleSidebar = () => { if (narrow) setDrawer((d) => !d); else setSettings({ sidebarCollapsed: !s.sidebarCollapsed }); };

  return (
    <div className="board-inner" style={{ fontSize: baseFontPx(width) }}>
      {drawer && narrow && <div className="side-scrim" onPointerDown={() => setDrawer(false)} />}
      <Sidebar mode={drawer && narrow ? "drawer" : sbMode} place={place} counts={counts} collections={collections} hotCollection={drag?.hot}
        onPlace={go} onToggle={toggleSidebar} onNewCollection={() => setDialog({ t: "newcol" })} onCollectionMenu={collectionMenu} />

      <div className="main">
        <header className="bar">
          <button className="icon-btn grip" aria-label="Move board" title="Drag to move the board" {...gripProps}><Icon name="grip" /></button>
          <h1 className="title">{title}{!inSettings && <small>{filtered ? `${shown.length} of ${counts[section] ?? items.length}` : shown.length}</small>}</h1>
          <button className="icon-btn" aria-label="Command palette" title="Command palette (Ctrl+K)" onClick={() => setPalette(true)}><Icon name="command" /></button>
          <button className={`icon-btn ${paused ? "warn" : ""}`} aria-pressed={paused} aria-label={paused ? "Resume capture" : "Pause capture"} title={paused ? "Capture paused — click to resume" : "Pause capture"}
            onClick={() => setSettings({ capture: { ...s.capture, enabled: paused } })}><Icon name={paused ? "play" : "pause"} size={17} /></button>
          <button className="icon-btn" aria-label="Close board" title="Close (Esc)" onClick={onClose}><Icon name="close" /></button>
        </header>

        {inSettings ? <SettingsPanel store={store} /> : <>
          <div className="tools">
            <label className="search"><Icon name="search" size={15} />
              <input ref={search} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Search ${section === "all" ? "everything" : title.toLowerCase()}`} title="Search (Ctrl+F)" aria-label="Search"
                onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); listBox.current?.querySelector<HTMLElement>(".card")?.focus(); } }} />
              {text && <button className="icon-btn clear" aria-label="Clear search" title="Clear search" onClick={() => { setText(""); search.current?.focus(); }}><Icon name="close" size={14} /></button>}
            </label>
            <div className="seg icons" role="radiogroup" aria-label="View">
              <button role="radio" aria-checked={s.viewMode === "list"} className={s.viewMode === "list" ? "on" : ""} aria-label="List view" title="List" onClick={() => setSettings({ viewMode: "list" })}><Icon name="list" /></button>
              <button role="radio" aria-checked={s.viewMode === "grid"} className={s.viewMode === "grid" ? "on" : ""} aria-label="Grid view" title="Grid" onClick={() => setSettings({ viewMode: "grid" })}><Icon name="grid" /></button>
            </div>
            <button className={`icon-btn ${sort !== "recent" || date !== "any" ? "on" : ""}`} aria-label="Sort and filter" aria-haspopup="menu" title={`Sort: ${SORT_LABEL[sort]} · Date: ${DATE_LABEL[date]}`} onClick={optionsMenu}><Icon name="filter" /></button>
          </div>
          {(tag || date !== "any") && <div className="chip-row">
            {tag && <span className="chip">#{tag}<button aria-label={`Remove tag filter ${tag}`} onClick={() => setTag(undefined)}><Icon name="close" size={12} /></button></span>}
            {date !== "any" && <span className="chip">{DATE_LABEL[date]}<button aria-label="Remove date filter" onClick={() => setDate("any")}><Icon name="close" size={12} /></button></span>}
          </div>}
          <div ref={listBox} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
            {shown.length === 0 ? <EmptyState copy={empty} onAction={onEmptyAction} /> : (
              <ItemList items={shown} sort={sort} view={s.viewMode} density={s.rowDensity} cols={cols} now={now} selected={selected} activeId={activeId} copiedId={copiedId} draggingIds={drag?.ids}
                listKey={`${section}|${s.viewMode}`} onActivate={onActivateGuarded} onOpen={onOpenItem} onMenu={onMenu} onToggleSelect={onToggleSelect} onTag={setTag} onFav={onFav} onPin={onPin} onPointerDown={onPointerDown} />)}
            <AnimatePresence>{sel.length > 0 && (
              <SelectionBar count={sel.length} allFavourite={sel.every((i) => i.favorite)} allPinned={sel.every((i) => i.pinned)} onFav={() => toggleFav(sel)} onPin={() => togglePin(sel)}
                onMove={(x, y) => setMenu({ x, y, kb: false, label: "Move to collection", entries: [{ head: "Move to collection" }, ...moveEntries(sel.map((i) => i.id))] })} onRemove={() => setDialog({ t: "bulkremove" })} onClear={clearSelection} />)}</AnimatePresence>
          </div>
          <footer className="foot"><span>{items.length} items</span><span className="state" data-paused={paused}><i />{paused ? "Capture paused" : "Capturing"}</span></footer>
        </>}

        {dropping && <div className="drop" aria-hidden><div><Icon name="pin" size={28} /><b>Drop to save</b></div></div>}
      </div>

      {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>{drag.ids.length === 1 ? "Move 1 item" : `Move ${drag.ids.length} items`}{drag.hot ? ` → ${names.get(drag.hot)}` : ""}</div>}

      <AnimatePresence>{menu && <Menu key="menu" x={menu.x} y={menu.y} entries={menu.entries} focusFirst={menu.kb} label={menu.label} onClose={() => setMenu(null)} />}</AnimatePresence>
      <AnimatePresence>{palette && <CommandPalette commands={commands} items={items} onCopyItem={(i) => void doCopy(i)} onClose={() => setPalette(false)} />}</AnimatePresence>
      <AnimatePresence>
        {dialog?.t === "rename" && <Prompt key="rename" title="Rename label" initial={dialog.item.title} onCancel={() => setDialog(null)} onSubmit={(v) => { store.retitle(dialog.item, v); setDialog(null); }} />}
        {dialog?.t === "tag" && <Prompt key="tag" title="Add tag" placeholder="e.g. invoice" action="Add" onCancel={() => setDialog(null)} onSubmit={(v) => { const t = v.trim().replace(/^#/, "").toLowerCase(); if (t && !dialog.item.tags.includes(t)) patchItem(dialog.item.id, { tags: [...dialog.item.tags, t] }); setDialog(null); }} />}
        {dialog?.t === "edit" && <Prompt key="edit" title="Edit text" multiline initial={dialog.item.content} onCancel={() => setDialog(null)} onSubmit={(v) => { if (v.trim()) patchItem(dialog.item.id, { content: v, title: v.trim().split("\n")[0].slice(0, 60), sizeBytes: undefined }); setDialog(null); }} />}
        {dialog?.t === "newcol" && <Prompt key="newcol" title="New collection" placeholder="Name" action="Create" onCancel={() => setDialog(null)} onSubmit={(v) => { const id = store.addCollection(v); setDialog(null); if (id) go(collectionSection(id)); }} />}
        {dialog?.t === "renamecol" && <Prompt key="renamecol" title="Rename collection" initial={dialog.col.name} onCancel={() => setDialog(null)} onSubmit={(v) => { store.renameCollection(dialog.col.id, v); setDialog(null); }} />}
        {dialog?.t === "delcol" && <Confirm key="delcol" title={`Delete “${dialog.col.name}”?`} body="The items in it are not deleted. They move to another collection." action="Delete collection" onNo={() => setDialog(null)} onYes={() => { store.deleteCollection(dialog.col.id); setDialog(null); }} />}
        {dialog?.t === "remove" && <Confirm key="remove" title="Remove from board?" body="Only the board entry is removed. Original files are never touched." action="Remove" onNo={() => setDialog(null)} onYes={() => { remove([dialog.item.id]); setDialog(null); }} />}
        {dialog?.t === "bulkremove" && <Confirm key="bulk" title={`Remove ${sel.length} items?`} body="Only the board entries are removed. Original files are never touched." action="Remove" onNo={() => setDialog(null)} onYes={() => { remove(sel.map((i) => i.id)); clearSelection(); setDialog(null); }} />}
        {dialog?.t === "view" && <ItemViewer key="view" item={dialog.item} collectionName={names.get(dialog.item.collectionId)} onClose={() => setDialog(null)} onCopy={() => { void doCopy(dialog.item); setDialog(null); }} onEdit={() => setDialog({ t: "edit", item: dialog.item })} onOpen={() => void openItem(dialog.item)} />}
        {dialog?.t === "image" && <Modal key="image" label={dialog.item.title} onClose={() => setDialog(null)}><div className="lightbox" onClick={() => setZoom(!zoom)} data-zoom={zoom}><img src={imageSrc(dialog.item)} alt={dialog.item.title} /><small>{dialog.item.title} · click to {zoom ? "fit" : "zoom"}</small></div></Modal>}
      </AnimatePresence>
    </div>
  );
}
