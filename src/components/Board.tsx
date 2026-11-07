import { useEffect, useMemo, useRef, useState, type PointerEventHandler } from "react";
import type { ItemKind, PinItem, SortKey } from "../lib/types";
import { runQuery } from "../lib/search";
import type { Store } from "../lib/store";
import { Card } from "./Card";
import { ContextMenu } from "./ContextMenu";
import { SettingsPanel } from "./SettingsPanel";
import { Confirm, Icon, Modal, P, Prompt } from "./Ui";
import { imageSrc } from "../native/tauriBackend";

const CHIPS: { id: string; label: string; kinds: ItemKind[] }[] = [
  { id: "all", label: "All", kinds: [] }, { id: "text", label: "Text", kinds: ["text"] }, { id: "links", label: "Links", kinds: ["url"] },
  { id: "images", label: "Images", kinds: ["image"] }, { id: "files", label: "Files", kinds: ["file", "group"] }, { id: "folders", label: "Folders", kinds: ["folder"] },
];
type Dialog = { t: "rename" | "tag" | "edit" | "newcol"; item?: PinItem } | { t: "remove"; item: PinItem } | { t: "image"; item: PinItem } | null;

export function Board({ store, cols, density, fontPx, dropping, onClose, gripProps, searchTick }: {
  store: Store; cols: number; density: string; fontPx: number; dropping: boolean; onClose: () => void; gripProps: { onPointerDown: PointerEventHandler }; searchTick: number }) {
  const { snap, patchItem, remove, copy, setSettings } = store;
  const [text, setText] = useState(""); const [chip, setChip] = useState("all"); const [col, setCol] = useState<string | undefined>();
  const [tag, setTag] = useState<string | undefined>(); const [fav, setFav] = useState(false); const [sort, setSort] = useState<SortKey>("recent");
  const [menu, setMenu] = useState<{ item: PinItem; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null); const [view, setView] = useState<"board" | "settings">("board");
  const [zoom, setZoom] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); search.current?.select(); setView("board"); }, [searchTick]);

  // Escape closes the innermost layer first (dialog → menu → settings → board).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || menu) return;
      if (dialog) setDialog(null); else if (view === "settings") setView("board"); else if (text) setText(""); else onClose();
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [menu, dialog, view, text, onClose]);

  const items = snap?.items ?? []; const collections = snap?.collections ?? [];
  const shown = useMemo(() => runQuery(items, { text, kinds: CHIPS.find((c) => c.id === chip)!.kinds, collectionId: col, tag, favoritesOnly: fav, sort }), [items, text, chip, col, tag, fav, sort]);
  if (!snap) return null;
  const paused = !snap.settings.capture.enabled;
  const counts = (id?: string) => items.filter((i) => !id || i.collectionId === id).length;

  const open = async (i: PinItem) => {
    if (i.kind === "text") return setDialog({ t: "edit", item: i });
    if (i.kind === "image") return setDialog({ t: "image", item: i });
    try { if (!(await store.backend.openItem(i))) toast("Opening files is available in the Windows app"); } catch (e) { toast(String(e)); }
  };
  const toast = (m: string) => window.dispatchEvent(new CustomEvent("pb-toast", { detail: m }));
  const actions = (i: PinItem) => ({ copy: () => void copy(i), open: () => void open(i), edit: () => setDialog({ t: "edit", item: i }), rename: () => setDialog({ t: "rename", item: i }),
    tag: () => setDialog({ t: "tag", item: i }), pin: () => patchItem(i.id, { pinned: !i.pinned }), fav: () => patchItem(i.id, { favorite: !i.favorite }),
    move: (id: string) => patchItem(i.id, { collectionId: id }), reveal: async () => { try { if (!(await store.backend.revealItem(i))) toast("Showing in Explorer is available in the Windows app"); } catch (e) { toast(String(e)); } },
    remove: () => setDialog({ t: "remove", item: i }) });

  return (
    <div className="board-inner" style={{ fontSize: fontPx }} data-density={density}>
      <header className="bar">
        <button className="icon-btn grip" aria-label="Move board" title="Drag to move the board" {...gripProps}><Icon d={P.grip} /></button>
        <label className="search"><Icon d={P.search} size={15} />
          <input ref={search} value={text} onChange={(e) => setText(e.target.value)} placeholder="Search…" title="Search (Ctrl+F)" aria-label="Search" /></label>
        <button className={`icon-btn ${paused ? "warn" : ""}`} aria-pressed={paused} aria-label={paused ? "Resume capture" : "Pause capture"} title={paused ? "Capture paused — click to resume" : "Pause capture"}
          onClick={() => setSettings({ capture: { ...snap.settings.capture, enabled: paused } })}><Icon d={paused ? P.play : P.pause} /></button>
        <button className={`icon-btn ${view === "settings" ? "on" : ""}`} aria-label="Settings" onClick={() => setView(view === "settings" ? "board" : "settings")}><Icon d={P.gear} /></button>
        <button className="icon-btn" aria-label="Close board" onClick={onClose}><Icon d={P.x} /></button>
      </header>

      {view === "settings" ? <SettingsPanel store={store} onBack={() => setView("board")} /> : <>
        <nav className="tabs" aria-label="Collections">
          <button className={!col ? "on" : ""} onClick={() => setCol(undefined)}>All <small>{counts()}</small></button>
          {collections.map((c) => <button key={c.id} className={col === c.id ? "on" : ""} onClick={() => setCol(col === c.id ? undefined : c.id)}><i style={{ background: c.color }} />{c.name} <small>{counts(c.id)}</small></button>)}
          <button className="add" aria-label="New collection" title="New collection" onClick={() => setDialog({ t: "newcol" })}>+</button>
        </nav>
        <div className="filters">
          {CHIPS.map((c) => <button key={c.id} className={`chip ${chip === c.id ? "on" : ""}`} onClick={() => setChip(c.id)}>{c.label}</button>)}
          <button className={`chip ${fav ? "on" : ""}`} aria-pressed={fav} onClick={() => setFav(!fav)}>★ Favourites</button>
          {tag && <button className="chip on" onClick={() => setTag(undefined)}>#{tag} ✕</button>}
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">Recent</option><option value="name">Name</option><option value="size">Size</option><option value="type">Type</option></select>
        </div>
        <main className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {shown.map((i) => <Card key={i.id} item={i} density={density} onCopy={() => void copy(i)} onOpen={() => void open(i)} onTag={setTag} onMenu={(x, y) => setMenu({ item: i, x, y })} />)}
          {shown.length === 0 && <div className="empty"><h2>{items.length ? "Nothing matches" : "Your board is empty"}</h2>
            <p>{items.length ? "Try another search or clear the filters." : paused ? "Capture is paused." : "Copy something, paste here (Ctrl+V) or drop files onto the board."}</p></div>}
        </main>
        <footer className="foot"><span>{shown.length} of {items.length} items</span><span>{paused ? "Capture paused" : "Capturing"}</span></footer>
      </>}

      {dropping && <div className="drop" aria-hidden><div><Icon d={P.pin} size={28} /><b>Drop to pin</b></div></div>}
      {menu && <ContextMenu {...menu} collections={collections} actions={actions(menu.item)} onClose={() => setMenu(null)} />}
      {dialog?.t === "rename" && <Prompt title="Rename label" initial={dialog.item!.title} onCancel={() => setDialog(null)} onSubmit={(v) => { store.retitle(dialog.item!, v); setDialog(null); }} />}
      {dialog?.t === "tag" && <Prompt title="Add tag" placeholder="e.g. invoice" onCancel={() => setDialog(null)} onSubmit={(v) => { const t = v.trim().replace(/^#/, "").toLowerCase(); if (t && !dialog.item!.tags.includes(t)) patchItem(dialog.item!.id, { tags: [...dialog.item!.tags, t] }); setDialog(null); }} />}
      {dialog?.t === "edit" && <Prompt title="Edit text" multiline initial={dialog.item!.content} onCancel={() => setDialog(null)} onSubmit={(v) => { if (v.trim()) patchItem(dialog.item!.id, { content: v, title: v.trim().split("\n")[0].slice(0, 60), sizeBytes: undefined }); setDialog(null); }} />}
      {dialog?.t === "newcol" && <Prompt title="New collection" placeholder="Name" onCancel={() => setDialog(null)} onSubmit={(v) => { const n = v.trim(); if (n) store.setCollections([...collections, { id: `c-${Date.now().toString(36)}`, name: n.slice(0, 24), color: ["#8b6cf7", "#38bdf8", "#34d399", "#f59e0b", "#f472b6"][collections.length % 5] }]); setDialog(null); }} />}
      {dialog?.t === "remove" && <Confirm title="Remove from board?" body="Only the board entry is removed. Original files are never touched." action="Remove" onNo={() => setDialog(null)} onYes={() => { remove([dialog.item.id]); setDialog(null); }} />}
      {dialog?.t === "image" && <Modal onClose={() => setDialog(null)}><div className="lightbox" onClick={() => setZoom(!zoom)} data-zoom={zoom}><img src={imageSrc(dialog.item)} alt={dialog.item.title} /><small>{dialog.item.title} · click to {zoom ? "fit" : "zoom"}</small></div></Modal>}
    </div>
  );
}
