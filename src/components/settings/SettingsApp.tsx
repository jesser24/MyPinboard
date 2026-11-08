import { useCallback, useEffect, useRef, useState } from "react";
import type { Store } from "../../lib/store";
import { useElementWidth } from "../../lib/hooks";
import { Board } from "../Board";
import { Panel } from "../Panel";
import { ErrorState } from "../EmptyState";
import { Icon, type IconName } from "../Ui";
import { Appearance } from "./Appearance";
import { AnimationSettings } from "./Animations";
import { AboutSettings, BehaviorSettings, ClipboardSettings, PrivacySettings } from "./DataSections";
import { ToggleSettings, TogglePreview } from "./Toggle";

export type Section = "appearance" | "toggle" | "animations" | "clipboard" | "behavior" | "privacy" | "library" | "about";
export const SECTIONS: { id: Section; label: string; icon: IconName; blurb: string }[] = [
  { id: "appearance", label: "Appearance", icon: "palette", blurb: "Theme, glass material and panel size." },
  { id: "toggle", label: "Toggle", icon: "panelRight", blurb: "The edge tab that opens the panel." },
  { id: "animations", label: "Animations", icon: "sparkle", blurb: "How the panel opens and closes." },
  { id: "clipboard", label: "Clipboard", icon: "clipboardList", blurb: "History, retention and copy behaviour." },
  { id: "behavior", label: "Behavior", icon: "keyboard", blurb: "Startup, shortcuts and closing." },
  { id: "privacy", label: "Privacy", icon: "privacy", blurb: "What is captured and where it lives." },
  { id: "library", label: "Library", icon: "layers", blurb: "Collections, favourites, tags and bulk actions." },
  { id: "about", label: "About", icon: "about", blurb: "" },
];
export const isSection = (v: unknown): v is Section => SECTIONS.some((s) => s.id === v);

/** The full MyPinboard window: every setting and the library. Kept separate from the floating panel. */
export function SettingsApp({ store, section, onSection, onClose }: { store: Store; section: Section; onSection(s: Section): void; onClose?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null); const width = useElementWidth(wrap);
  const [previewOpen, setPreviewOpen] = useState(true); const timer = useRef<number>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const s = store.snap?.settings;
  const native = !!store.backend && "native" in store.backend && !!(store.backend as { native: unknown }).native;

  /** Close the real panel with the current animation, then open it again with it. */
  const replay = useCallback(() => {
    clearTimeout(timer.current); setPreviewOpen(false);
    const ms = s && s.animSpeed !== 0 ? s.animDuration * 0.7 : 0;
    timer.current = window.setTimeout(() => setPreviewOpen(true), ms + 220);
  }, [s]);

  if (!store.snap) return <div className="sa"><div className="sa-main">{store.error ? <ErrorState message={store.error} onRetry={store.retry} /> : <div className="loading" role="status">Loading…</div>}</div></div>;
  const cur = SECTIONS.find((x) => x.id === section) ?? SECTIONS[0];
  const hasPreview = section === "appearance" || section === "animations" || section === "toggle";
  const settings = store.snap.settings;

  return (
    <div className="sa" ref={wrap} data-narrow={width > 0 && width < 860}>
      <nav className="sa-nav" aria-label="Settings sections">
        <div className="sa-brand"><span className="logo"><Icon name="pin" size={15} /></span><b>MyPinboard</b></div>
        {SECTIONS.map((x) => (
          <button key={x.id} className="sa-navitem" data-section={x.id} aria-current={x.id === section ? "page" : undefined} onClick={() => onSection(x.id)}>
            <Icon name={x.icon} /><span>{x.label}</span>
          </button>))}
      </nav>
      <main className="sa-main">
        <header className="sa-head"><div><h1>{cur.label}</h1>{cur.blurb && <p>{cur.blurb}</p>}</div>{onClose && <button className="icon-btn" aria-label="Close settings" title="Close" onClick={onClose}><Icon name="close" /></button>}</header>
        {section === "library"
          ? <div className="sa-library"><Board store={store} width={Math.max(0, width - 200)} onSettings={() => onSection("appearance")} /></div>
          : <div className="sa-body" data-preview={hasPreview}>
              <div className="sa-scroll" key={section}>
                {section === "appearance" && <Appearance store={store} native={native} />}
                {section === "toggle" && <ToggleSettings store={store} />}
                {section === "animations" && <AnimationSettings store={store} onReplay={replay} />}
                {section === "clipboard" && <ClipboardSettings store={store} />}
                {section === "behavior" && <BehaviorSettings store={store} />}
                {section === "privacy" && <PrivacySettings store={store} />}
                {section === "about" && <AboutSettings store={store} />}
              </div>
              {hasPreview && (
                <aside className="sa-preview" aria-label="Live preview">
                  <div className="pv-label">Live preview</div>
                  {section === "toggle"
                    ? <div className="pv-stage small"><TogglePreview s={settings} /></div>
                    : <div className="pv-stage"><div className="pv-frame" ref={(n) => { if (n) n.setAttribute("inert", ""); }} aria-hidden="true">
                        <Panel store={store} edge={settings.edge} open={previewOpen} mode="static" onClose={() => {}} onOpenSettings={() => {}} /></div></div>}
                  {section === "animations" && <button className="btn small pv-replay" onClick={replay}><Icon name="play" size={13} />Replay</button>}
                </aside>)}
            </div>}
      </main>
    </div>
  );
}
