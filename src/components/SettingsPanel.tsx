import { useRef, useState } from "react";
import type { Store } from "../lib/store";
import { ACCENTS, type Settings } from "../lib/settings";
import { findConflicts, normaliseKeys } from "../lib/shortcuts";
import { Confirm, Icon, P } from "./Ui";
import { TauriBackend, type StorageInfo } from "../native/tauriBackend";
import { useEffect } from "react";
import { formatSize } from "../lib/capture";

const ACTION_LABEL: Record<string, string> = { toggle: "Toggle board", pause: "Pause / resume capture", capture: "Manual capture", search: "Search" };
const Seg = <T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) =>
  <div className="seg" role="radiogroup" aria-label={label}>{options.map(([v, l]) => <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;

export function SettingsPanel({ store, onBack }: { store: Store; onBack: () => void }) {
  const s = store.snap!.settings; const set = store.setSettings; const [confirm, setConfirm] = useState(false); const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const native = store.backend instanceof TauriBackend ? store.backend : null; const [info, setInfo] = useState<StorageInfo | null>(null);
  const refreshInfo = () => { native?.storageInfo().then(setInfo).catch(() => setInfo(null)); };
  useEffect(refreshInfo, [native, store.snap?.items.length]);
  /** Native file dialogs take focus from the board; tell the board not to auto-close meanwhile. */
  const busy = (d: number) => window.dispatchEvent(new CustomEvent("pb-busy", { detail: d }));
  const withDialog = (open: () => void) => { busy(1); addEventListener("focus", () => setTimeout(() => busy(-1), 500), { once: true }); open(); };
  const conflicts = findConflicts(s.shortcuts);
  const cap = (k: keyof Settings["capture"]) => set({ capture: { ...s.capture, [k]: !s.capture[k] } });

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ app: "MyPinboard", version: 1, exportedAt: new Date().toISOString(), ...store.snap }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `MyPinboard-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg("Backup exported");
  };
  const importBackup = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      if (j?.app !== "MyPinboard" || !Array.isArray(j.items) || !Array.isArray(j.collections)) throw new Error("not a MyPinboard backup");
      await store.restore({ items: j.items, collections: j.collections, settings: { ...s, ...j.settings } }); setMsg(`Restored ${j.items.length} items`);
    } catch (e) { setMsg(`Restore failed: ${(e as Error).message}`); }
  };
  const colls = store.snap!.collections;

  return (
    <div className="settings">
      <button className="btn back" onClick={onBack}><Icon d={P.back} /> Board</button>
      <section><h4>Appearance</h4>
        <div className="field"><span>Theme</span><Seg label="Theme" value={s.theme} onChange={(v) => set({ theme: v })} options={[["system", "System"], ["dark", "Dark"], ["light", "Light"]]} /></div>
        <div className="field"><span>Accent</span><div className="swatches">{(Object.keys(ACCENTS) as Settings["accent"][]).map((k) =>
          <button key={k} aria-label={k} aria-pressed={s.accent === k} className={s.accent === k ? "on" : ""} style={{ background: `linear-gradient(135deg, ${ACCENTS[k][0]}, ${ACCENTS[k][1]})` }} onClick={() => set({ accent: k })} />)}</div></div>
        <label className="field"><span>Transparency <small>{Math.round((1 - s.transparency) * 100)}%</small></span><input type="range" min={0.35} max={1} step={0.01} value={s.transparency} onChange={(e) => set({ transparency: +e.target.value })} /></label>
        <label className="field"><span>Blur <small>{s.blur}px</small></span><input type="range" min={0} max={40} step={1} value={s.blur} onChange={(e) => set({ blur: +e.target.value })} /></label>
        <div className="field"><span>Animation</span><Seg label="Animation speed" value={s.animSpeed} onChange={(v) => set({ animSpeed: v })} options={[[0, "Off"], [0.5, "Slow"], [1, "Normal"], [2, "Fast"]]} /></div>
        <p className="hint">Readability is protected: text colours never depend on transparency. System backdrop (Mica/Acrylic) applies in the Windows app.</p>
      </section>
      <section><h4>Capture</h4>
        <label className="check"><input type="checkbox" checked={s.capture.enabled} onChange={() => cap("enabled")} /> Automatic capture</label>
        <div className="checks">{(["text", "urls", "images", "files", "folders"] as const).map((k) => <label key={k} className="check"><input type="checkbox" disabled={!s.capture.enabled} checked={s.capture[k]} onChange={() => cap(k)} /> {k}</label>)}</div>
        <label className="field"><span>Max items</span><input type="number" min={20} max={5000} value={s.maxItems} onChange={(e) => set({ maxItems: Math.max(20, Math.min(5000, +e.target.value || 500)) })} /></label>
        <label className="field col"><span>Excluded applications (one per line)</span><textarea rows={3} value={s.excludedApps.join("\n")} onChange={(e) => set({ excludedApps: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></label>
        <p className="hint">Clipboard watching and app exclusion run natively in the Windows app. Nothing leaves your PC.</p>
      </section>
      {native && <section><h4>System</h4>
        <label className="check"><input type="checkbox" disabled={!!info?.portable} checked={s.startWithWindows} onChange={() => set({ startWithWindows: !s.startWithWindows })} /> Start with Windows{info?.portable ? " (not in portable mode)" : ""}</label>
        <label className="check"><input type="checkbox" checked={s.notifications} onChange={() => set({ notifications: !s.notifications })} /> Notifications</label>
        <p className="hint">The app keeps running in the notification area when the board is closed.</p></section>}
      <section><h4>Shortcuts</h4>
        {s.shortcuts.map((b, n) => { const bad = conflicts.some((g) => g.some((x) => x.action === b.action));
          return <label key={b.action} className="field"><span>{ACTION_LABEL[b.action] ?? b.action}</span>
            <input className={bad ? "bad" : ""} aria-invalid={bad} value={b.keys} onChange={(e) => set({ shortcuts: s.shortcuts.map((x, i) => (i === n ? { ...x, keys: e.target.value } : x)) })} onBlur={(e) => set({ shortcuts: s.shortcuts.map((x, i) => (i === n ? { ...x, keys: normaliseKeys(e.target.value).split("+").map((p) => p.length > 1 ? p[0].toUpperCase() + p.slice(1) : p.toUpperCase()).join("+") } : x)) })} /></label>; })}
        {conflicts.length > 0 && <p className="warn-text">Conflict: {conflicts.map((g) => g.map((b) => ACTION_LABEL[b.action] ?? b.action).join(" and ")).join("; ")} use the same keys.</p>}
        <p className="hint">Toggle, pause and manual capture are global (Windows app). Ctrl+F and Esc work inside the board.</p>
      </section>
      <section><h4>Collections</h4>
        {colls.map((c, i) => <div key={c.id} className="field"><span><i className="dot" style={{ background: c.color }} />
          <input className="inline" value={c.name} aria-label={`Collection ${i + 1} name`} onChange={(e) => store.setCollections(colls.map((x) => (x.id === c.id ? { ...x, name: e.target.value.slice(0, 24) } : x)))} /></span>
          <button className="btn small" disabled={colls.length <= 1} onClick={() => { const fallback = colls.find((x) => x.id !== c.id)!.id;
            store.snap!.items.filter((it) => it.collectionId === c.id).forEach((it) => store.patchItem(it.id, { collectionId: fallback })); store.setCollections(colls.filter((x) => x.id !== c.id)); }}>Delete</button></div>)}
        <p className="hint">Deleting a collection moves its items to another collection.</p>
      </section>
      <section><h4>Data</h4>
        <div className="row"><button className="btn" onClick={() => withDialog(exportBackup)}>Export backup</button><button className="btn" onClick={() => withDialog(() => file.current?.click())}>Restore…</button>
          <button className="btn danger" onClick={() => setConfirm(true)}>Clear history</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = ""; }} /></div>
        {msg && <p className="hint" role="status">{msg}</p>}
        {native && info ? <>
          <p className="hint">Stored locally in <b>{info.dataDir}</b>{info.portable ? " (portable mode)" : ""} — {info.itemCount} items, database {formatSize(info.dbBytes)}, {info.imageCount} images {formatSize(info.imagesBytes)}. Nothing is sent anywhere.</p>
          <div className="row"><button className="btn small" onClick={() => void native.openDataDir()}>Open data folder</button><button className="btn small" onClick={() => void native.captureClipboard().catch((e) => setMsg(String(e)))}>Capture clipboard now</button></div>
          <p className="hint">JSON backups contain items and settings; image files are not embedded yet.</p></>
          : <p className="hint">Stored locally in this browser while previewing; the Windows app stores everything in %APPDATA%\MyPinboard.</p>}
      </section>
      {confirm && <Confirm title="Clear history?" body="Removes all items except pinned and favourite ones. Original files are never touched." action="Clear" onNo={() => setConfirm(false)} onYes={() => { store.clearHistory(); setConfirm(false); }} />}
    </div>
  );
}
