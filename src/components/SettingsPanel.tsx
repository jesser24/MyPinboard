import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import type { Store } from "../lib/store";
import { ACCENTS, type Accent, type Settings } from "../lib/settings";
import { findConflicts, normaliseKeys } from "../lib/shortcuts";
import { formatSize } from "../lib/capture";
import { TauriBackend, type StorageInfo } from "../native/tauriBackend";
import { Confirm, Icon, type IconName } from "./Ui";
import { useMotion } from "./Motion";

const ACTION_LABEL: Record<string, string> = { toggle: "Show or hide the board", pause: "Pause or resume capture", capture: "Capture the clipboard now", search: "Search" };
type Tab = "appearance" | "behavior" | "storage" | "privacy" | "about";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "appearance", label: "Appearance", icon: "palette" }, { id: "behavior", label: "Behavior", icon: "filter" }, { id: "storage", label: "Storage", icon: "storage" },
  { id: "privacy", label: "Privacy", icon: "privacy" }, { id: "about", label: "About", icon: "about" },
];
export const BOARD_SHORTCUTS: [string, string][] = [
  ["Command palette", "Ctrl K"], ["Search", "Ctrl F"], ["Settings", "Ctrl ,"], ["Move between items", "↑ ↓"], ["Copy the item", "Enter"], ["View the whole item", "Space"],
  ["Favourite", "F"], ["Pin", "P"], ["Remove", "Del"], ["Select several", "Ctrl click · Shift click"], ["Select all", "Ctrl A"], ["Close the innermost layer", "Esc"],
];

const Row = ({ label, hint, children, col }: { label: string; hint?: ReactNode; children: ReactNode; col?: boolean }) =>
  <div className={`s-row ${col ? "col" : ""}`}><div className="label"><b>{label}</b>{hint && <small>{hint}</small>}</div><div className="ctl">{children}</div></div>;
const Switch = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) =>
  <button role="switch" className="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
const Seg = <T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) =>
  <div className="seg" role="radiogroup" aria-label={label}>{options.map(([v, l]) => <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
const Slider = ({ value, min, max, step, onChange, label, unit }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; unit: string }) =>
  <><input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(+e.target.value)} /><output>{value}{unit}</output></>;

export function SettingsPanel({ store, initialTab = "appearance" }: { store: Store; initialTab?: Tab }) {
  const s = store.snap!.settings; const set = store.setSettings; const mo = useMotion();
  const [tab, setTab] = useState<Tab>(initialTab); const [confirm, setConfirm] = useState(false); const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
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
  const protectedCount = store.snap!.items.filter((i) => i.pinned || i.favorite).length;

  return (
    <div className="settings">
      <div className="s-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className="s-tab" onClick={() => setTab(t.id)}
            onKeyDown={(e) => { const i = TABS.findIndex((x) => x.id === tab); const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1; if (n >= 0) { e.preventDefault(); const next = TABS[(n + TABS.length) % TABS.length].id; setTab(next); document.getElementById(`tab-${next}`)?.focus(); } }}>
            {t.label}{tab === t.id && <m.span layoutId="s-underline" className="underline" transition={mo.spring} />}
          </button>))}
      </div>
      <div className="s-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={mo.fade}>

            {tab === "appearance" && <>
              <section className="s-group"><h3>Theme</h3>
                <Row label="Colour scheme"><Seg label="Colour scheme" value={s.theme} onChange={(v) => set({ theme: v })} options={[["system", "System"], ["dark", "Dark"], ["light", "Light"]]} /></Row>
                <Row label="Accent colour"><div className="swatches">{(Object.keys(ACCENTS) as Accent[]).map((k) => <button key={k} aria-label={k} title={k} aria-pressed={s.accent === k} style={{ background: ACCENTS[k] }} onClick={() => set({ accent: k })} />)}</div></Row>
                <Row col label="Transparency" hint="How much of the desktop shows through the board. Text stays readable at any setting."><Slider label="Transparency" value={Math.round((1 - s.transparency) * 100)} min={0} max={65} step={1} unit="%" onChange={(v) => set({ transparency: 1 - v / 100 })} /></Row>
                <Row col label="Blur" hint="Browser preview only. The Windows app uses the system Mica or Acrylic material."><Slider label="Blur" value={s.blur} min={0} max={40} step={1} unit="px" onChange={(v) => set({ blur: v })} /></Row>
              </section>
              <section className="s-group"><h3>Layout</h3>
                <Row label="Item view"><Seg label="Item view" value={s.viewMode} onChange={(v) => set({ viewMode: v })} options={[["list", "List"], ["grid", "Grid"]]} /></Row>
                <Row col label="List density" hint="Compact shows one line per item."><Seg label="List density" value={s.rowDensity} onChange={(v) => set({ rowDensity: v })} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} /></Row>
              </section>
              <section className="s-group"><h3>Motion</h3>
                <Row col label="Animation speed" hint="Off removes all movement. The system “reduce motion” setting is always respected."><Seg label="Animation speed" value={s.animSpeed} onChange={(v) => set({ animSpeed: v })} options={[[0, "Off"], [0.5, "Slow"], [1, "Normal"], [2, "Fast"]]} /></Row>
              </section>
            </>}

            {tab === "behavior" && <>
              <section className="s-group"><h3>Edge handle</h3>
                <Row col label="Thickness" hint="How far the tab reaches in from the screen edge."><Slider label="Handle thickness" value={s.handleThickness} min={6} max={12} step={1} unit=" px" onChange={(v) => set({ handleThickness: v })} /></Row>
                <Row col label="Length" hint="Shorter tabs stay out of the way of window controls."><Slider label="Handle length" value={s.handleLength} min={30} max={100} step={5} unit="%" onChange={(v) => set({ handleLength: v })} /></Row>
                <Row label="New item indicator" hint="A small light on the tab when you have copied something since you last opened the board."><Switch label="New item indicator" on={s.handleIndicator} onChange={(v) => set({ handleIndicator: v })} /></Row>
                <p className="s-note">Drag the tab to move it to any screen edge. Its position is remembered.</p>
              </section>
              {native && <section className="s-group"><h3>System</h3>
                <Row label="Start with Windows" hint={info?.portable ? "Not available in portable mode." : "MyPinboard waits in the notification area."}><Switch label="Start with Windows" on={s.startWithWindows} disabled={!!info?.portable} onChange={(v) => set({ startWithWindows: v })} /></Row>
                <Row label="Notifications"><Switch label="Notifications" on={s.notifications} onChange={(v) => set({ notifications: v })} /></Row>
              </section>}
              <section className="s-group"><h3>Shortcuts</h3>
                {s.shortcuts.map((b, n) => { const bad = conflicts.some((g) => g.some((x) => x.action === b.action));
                  return <Row key={b.action} label={ACTION_LABEL[b.action] ?? b.action} hint={b.action === "search" ? "Works inside the board." : "Works anywhere in Windows."}>
                    <input className={`field-input ${bad ? "bad" : ""}`} style={{ width: 160 }} aria-invalid={bad} aria-label={`Shortcut: ${ACTION_LABEL[b.action] ?? b.action}`} value={b.keys}
                      onChange={(e) => set({ shortcuts: s.shortcuts.map((x, i) => (i === n ? { ...x, keys: e.target.value } : x)) })}
                      onBlur={(e) => set({ shortcuts: s.shortcuts.map((x, i) => (i === n ? { ...x, keys: normaliseKeys(e.target.value).split("+").map((p) => p.length > 1 ? p[0].toUpperCase() + p.slice(1) : p.toUpperCase()).join("+") } : x)) })} /></Row>; })}
                {conflicts.length > 0 && <p className="warn-text">Conflict: {conflicts.map((g) => g.map((b) => ACTION_LABEL[b.action] ?? b.action).join(" and ")).join("; ")} use the same keys.</p>}
              </section>
              <section className="s-group"><h3>Inside the board</h3>
                <div className="kbd-grid">{BOARD_SHORTCUTS.map(([a, k]) => <div key={a} style={{ display: "contents" }}><span>{a}</span><kbd>{k}</kbd></div>)}</div>
              </section>
            </>}

            {tab === "storage" && <>
              <section className="s-group"><h3>History</h3>
                <Row label="Items to keep" hint="When the limit is reached the oldest items are removed first."><input type="number" className="field-input" style={{ width: 90 }} min={20} max={5000} value={s.maxItems} aria-label="Items to keep" onChange={(e) => set({ maxItems: Math.max(20, Math.min(5000, +e.target.value || 500)) })} /></Row>
                <Row label="Protected items" hint="Pinned and favourite items are never removed by the limit or by Clear history."><span className="muted">{protectedCount} protected</span></Row>
                <Row label="Images" hint="Large images are stored as files in the data folder, not in the database."><span className="muted">{info ? `${info.imageCount} · ${formatSize(info.imagesBytes)}` : "Windows app"}</span></Row>
              </section>
              <section className="s-group"><h3>Backup</h3>
                <div className="row" style={{ marginTop: 4 }}><button className="btn" onClick={() => withDialog(exportBackup)}>Export backup</button><button className="btn" onClick={() => withDialog(() => file.current?.click())}>Restore from backup…</button>
                  <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = ""; }} /></div>
                {msg && <p className="s-note" role="status">{msg}</p>}
                <p className="s-note">A backup holds items, collections and settings. Image files are not embedded yet.</p>
              </section>
              <section className="s-group"><h3>Location</h3>
                {native && info ? <>
                  <p className="s-note" style={{ marginTop: 0 }}><b>{info.dataDir}</b>{info.portable ? " (portable mode)" : ""}</p>
                  <p className="s-note">{info.itemCount} items · database {formatSize(info.dbBytes)} · {info.imageCount} images {formatSize(info.imagesBytes)}</p>
                  <div className="row"><button className="btn small" onClick={() => void native.openDataDir()}>Open data folder</button></div></>
                  : <p className="s-note" style={{ marginTop: 0 }}>The browser preview keeps data in this browser. The Windows app stores everything in <b>%APPDATA%\MyPinboard</b>.</p>}
              </section>
            </>}

            {tab === "privacy" && <>
              <section className="s-group"><h3>What is captured</h3>
                <Row label="Capture the clipboard" hint="Turn this off to stop saving anything you copy."><Switch label="Capture the clipboard" on={s.capture.enabled} onChange={() => cap("enabled")} /></Row>
                {(["text", "urls", "images", "files", "folders"] as const).map((k) => <Row key={k} label={k[0].toUpperCase() + k.slice(1)}><Switch label={`Capture ${k}`} on={s.capture[k]} disabled={!s.capture.enabled} onChange={() => cap(k)} /></Row>)}
              </section>
              <section className="s-group"><h3>Excluded applications</h3>
                <Row col label="Never capture from these apps" hint="One program name per line, for example KeePass.exe. Content flagged by Windows as sensitive is never captured either.">
                  <textarea className="field-input" rows={4} aria-label="Excluded applications" value={s.excludedApps.join("\n")} onChange={(e) => set({ excludedApps: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Row>
                <p className="s-note">Clipboard watching and app exclusion run natively in the Windows app.</p>
              </section>
              <section className="s-group"><h3>Your data</h3>
                <p className="s-note" style={{ marginTop: 0 }}>Everything stays on this PC. MyPinboard has no account, no cloud sync and no telemetry.</p>
                <div className="row"><button className="btn danger" onClick={() => setConfirm(true)}><Icon name="trash" />Clear history</button></div>
                <p className="s-note">Removes every item except pinned and favourite ones. Original files are never touched.</p>
              </section>
            </>}

            {tab === "about" && <section className="s-group">
              <div className="about"><div className="logo"><Icon name="pin" size={26} /></div>
                <div><h3>MyPinboard</h3><p>{native?.native ? `Version ${native.native.version}` : "Browser preview"}</p></div></div>
              <p className="s-note">A private clipboard history that lives on the edge of your screen. Local first: no account, no cloud, no telemetry.</p>
              <div className="row"><button className="btn small" onClick={() => window.dispatchEvent(new CustomEvent("pb-open-link", { detail: "https://github.com/jesser24/MyPinboard" }))}><Icon name="open" />Project on GitHub</button></div>
            </section>}
          </m.div>
        </AnimatePresence>
      </div>
      <AnimatePresence>{confirm && <Confirm title="Clear history?" body="Removes all items except pinned and favourite ones. Original files are never touched." action="Clear history" onNo={() => setConfirm(false)} onYes={() => { store.clearHistory(); setConfirm(false); }} />}</AnimatePresence>
    </div>
  );
}
