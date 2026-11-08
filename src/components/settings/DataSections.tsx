import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import type { Store } from "../../lib/store";
import type { Settings } from "../../lib/settings";
import { findConflicts, normaliseKeys } from "../../lib/shortcuts";
import { formatSize } from "../../lib/capture";
import { TauriBackend, type StorageInfo } from "../../native/tauriBackend";
import { Confirm, Icon } from "../Ui";
import { Group, Row, Seg, Switch } from "./controls";

const ACTION_LABEL: Record<string, string> = { toggle: "Show or hide the panel", pause: "Pause or resume capture", capture: "Capture the clipboard now", search: "Search" };
export const PANEL_KEYS: [string, string][] = [
  ["Search", "Ctrl F  ·  /"], ["Move between items", "↑ ↓"], ["Copy the item", "Enter"], ["Delete the item", "Del"], ["Undo a delete", "Ctrl Z"], ["Open settings", "Ctrl ,"], ["Clear search, then close", "Esc"],
];

function useStorage(store: Store) {
  const native = store.backend instanceof TauriBackend ? store.backend : null; const [info, setInfo] = useState<StorageInfo | null>(null);
  useEffect(() => { native?.storageInfo().then(setInfo).catch(() => setInfo(null)); }, [native, store.snap?.items.length]);
  return { native, info };
}
/** Native file dialogs take focus from the panel; tell it not to auto-close meanwhile. */
const busy = (d: number) => window.dispatchEvent(new CustomEvent("pb-busy", { detail: d }));
const withDialog = (open: () => void) => { busy(1); addEventListener("focus", () => setTimeout(() => busy(-1), 500), { once: true }); open(); };

export function ClipboardSettings({ store }: { store: Store }) {
  const s = store.snap!.settings; const set = store.setSettings; const { info } = useStorage(store);
  const [msg, setMsg] = useState(""); const file = useRef<HTMLInputElement>(null);
  const cap = (k: keyof Settings["capture"]) => set({ capture: { ...s.capture, [k]: !s.capture[k] } });
  const protectedCount = store.snap!.items.filter((i) => i.pinned || i.favorite).length;
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
  return <>
    <Group title="History">
      <Row label="Items to keep" hint="When the limit is reached the oldest items are removed first."><input type="number" className="field-input" style={{ width: 90 }} min={20} max={5000} value={s.maxItems} aria-label="Items to keep" onChange={(e) => { const v = Math.round(+e.target.value); if (Number.isFinite(v)) set({ maxItems: Math.min(5000, Math.max(20, v)) }); }} /></Row>
      <Row col label="Retention" hint="Older items are removed when the panel opens. Pinned and favourite items are never removed.">
        <Seg<number> label="Retention period" value={s.retentionDays} onChange={(v) => set({ retentionDays: v })} options={[[0, "Forever"], [7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "1 year"]]} />
      </Row>
      <Row label="Protected items" hint="Pinned and favourite items survive the limit, retention and Clear history."><span className="muted">{protectedCount} protected</span></Row>
    </Group>
    <Group title="Copy behaviour">
      <Row col label="After copying an item" hint="Clicking an item copies it again to the Windows clipboard.">
        <Seg<Settings["copyBehavior"]> label="After copying" value={s.copyBehavior} onChange={(v) => set({ copyBehavior: v })} options={[["stay", "Keep the panel open"], ["close", "Close the panel"]]} />
      </Row>
    </Group>
    <Group title="What gets stored">
      <Row label="Capture the clipboard" hint="Turn this off to stop saving anything you copy."><Switch label="Capture the clipboard" on={s.capture.enabled} onChange={() => cap("enabled")} /></Row>
      {(["text", "urls", "images", "files", "folders"] as const).map((k) => <Row key={k} label={k[0].toUpperCase() + k.slice(1)}><Switch label={`Capture ${k}`} on={s.capture[k]} disabled={!s.capture.enabled} onChange={() => cap(k)} /></Row>)}
      <Row label="Images" hint="Large images are stored as files in the data folder, not in the database."><span className="muted">{info ? `${info.imageCount} · ${formatSize(info.imagesBytes)}` : "Windows app"}</span></Row>
    </Group>
    <Group title="Backup" note="A backup holds items, collections and settings. Image files are not embedded yet.">
      <div className="row"><button className="btn" onClick={() => withDialog(exportBackup)}>Export backup</button><button className="btn" onClick={() => withDialog(() => file.current?.click())}>Restore from backup…</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = ""; }} /></div>
      {msg && <p className="s-note" role="status">{msg}</p>}
    </Group>
  </>;
}

export function BehaviorSettings({ store }: { store: Store }) {
  const s = store.snap!.settings; const set = store.setSettings; const { native, info } = useStorage(store);
  const conflicts = findConflicts(s.shortcuts);
  return <>
    <Group title="Opening and closing">
      <Row label="Close when clicking outside" hint="The panel closes when it loses focus. Turn off to keep it open until you close it."><Switch label="Close when clicking outside" on={s.closeOnBlur} onChange={(v) => set({ closeOnBlur: v })} /></Row>
      <Row col label="After copying an item"><Seg<Settings["copyBehavior"]> label="After copying" value={s.copyBehavior} onChange={(v) => set({ copyBehavior: v })} options={[["stay", "Keep the panel open"], ["close", "Close the panel"]]} /></Row>
    </Group>
    {native && <Group title="Startup">
      <Row label="Start with Windows" hint={info?.portable ? "Not available in portable mode." : "MyPinboard waits quietly in the notification area."}><Switch label="Start with Windows" on={s.startWithWindows} disabled={!!info?.portable} onChange={(v) => set({ startWithWindows: v })} /></Row>
      <Row label="Notifications"><Switch label="Notifications" on={s.notifications} onChange={(v) => set({ notifications: v })} /></Row>
    </Group>}
    <Group title="Keyboard shortcuts">
      {s.shortcuts.map((b, n) => { const bad = conflicts.some((g) => g.some((x) => x.action === b.action));
        return <Row key={b.action} label={ACTION_LABEL[b.action] ?? b.action} hint={b.action === "search" ? "Works inside the panel." : "Works anywhere in Windows."}>
          <input className={`field-input ${bad ? "bad" : ""}`} style={{ width: 160 }} aria-invalid={bad} aria-label={`Shortcut: ${ACTION_LABEL[b.action] ?? b.action}`} value={b.keys}
            onChange={(e) => set({ shortcuts: s.shortcuts.map((x, i) => (i === n ? { ...x, keys: e.target.value } : x)) })}
            onBlur={(e) => set({ shortcuts: s.shortcuts.map((x, i) => (i === n ? { ...x, keys: normaliseKeys(e.target.value).split("+").map((p) => p.length > 1 ? p[0].toUpperCase() + p.slice(1) : p.toUpperCase()).join("+") } : x)) })} /></Row>; })}
      {conflicts.length > 0 && <p className="warn-text">Conflict: {conflicts.map((g) => g.map((b) => ACTION_LABEL[b.action] ?? b.action).join(" and ")).join("; ")} use the same keys.</p>}
    </Group>
    <Group title="Inside the panel"><div className="kbd-grid">{PANEL_KEYS.map(([a, k]) => <div key={a} style={{ display: "contents" }}><span>{a}</span><kbd>{k}</kbd></div>)}</div></Group>
  </>;
}

export function PrivacySettings({ store }: { store: Store }) {
  const s = store.snap!.settings; const set = store.setSettings; const { native, info } = useStorage(store);
  const [confirm, setConfirm] = useState(false);
  return <>
    <Group title="Excluded applications" note="Clipboard watching and app exclusion run natively in the Windows app. Content that Windows flags as sensitive is never captured either.">
      <Row col label="Never capture from these apps" hint="One program name per line, for example KeePass.exe."><textarea className="field-input" rows={4} aria-label="Excluded applications" value={s.excludedApps.join("\n")} onChange={(e) => set({ excludedApps: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Row>
    </Group>
    <Group title="Local storage">
      <p className="s-note" style={{ marginTop: 0 }}>Everything stays on this PC. MyPinboard has no account, no cloud sync and no telemetry.</p>
      {native && info ? <>
        <p className="s-note"><b>{info.dataDir}</b>{info.portable ? " (portable mode)" : ""}</p>
        <p className="s-note">{info.itemCount} items · database {formatSize(info.dbBytes)} · {info.imageCount} images {formatSize(info.imagesBytes)}</p>
        <div className="row"><button className="btn small" onClick={() => void native.openDataDir()}>Open data folder</button></div></>
        : <p className="s-note">The browser preview keeps data in this browser. The Windows app stores everything in <b>%APPDATA%\MyPinboard</b>.</p>}
    </Group>
    <Group title="Clear history" note="Removes every item except pinned and favourite ones. Original files are never touched.">
      <div className="row"><button className="btn danger" onClick={() => setConfirm(true)}><Icon name="trash" />Clear history</button></div>
    </Group>
    <AnimatePresence>{confirm && <Confirm title="Clear history?" body="Removes all items except pinned and favourite ones. Original files are never touched." action="Clear history" onNo={() => setConfirm(false)} onYes={() => { store.clearHistory(); setConfirm(false); }} />}</AnimatePresence>
  </>;
}

export function AboutSettings({ store }: { store: Store }) {
  const { native } = useStorage(store);
  return <Group title="About">
    <div className="about"><div className="logo"><Icon name="pin" size={26} /></div><div><h3>MyPinboard</h3><p>{native?.native ? `Version ${native.native.version}` : "Browser preview"}</p></div></div>
    <p className="s-note">A private clipboard history that lives on the edge of your screen. Local first: no account, no cloud, no telemetry.</p>
    <div className="row"><button className="btn small" onClick={() => { const u = "https://github.com/jesser24/MyPinboard"; void store.backend.openItem({ id: "link", kind: "url", title: u, content: u, collectionId: "", tags: [], pinned: false, favorite: false, capturedAt: 0, hash: "" }); }}><Icon name="open" />Project on GitHub</button></div>
  </Group>;
}
