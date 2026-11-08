import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { motionSpeed, type Settings } from "../lib/settings";
import { useStore } from "../lib/store";
import { MotionRoot } from "../components/Motion";
import { Toast } from "../components/Toast";
import { SettingsApp, isSection, type Section } from "../components/settings/SettingsApp";
import type { TauriBackend } from "./tauriBackend";

/** The separate MyPinboard window: every setting plus the library. Rust opens it (`open_settings`) and may ask it to switch section. */
export function NativeSettings({ backend }: { backend: TauriBackend }) {
  const [toast, setToast] = useState<string | null>(null); const timer = useRef<number>();
  const showToast = useCallback((m: string) => { setToast(m); clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 1800); }, []);
  const store = useStore(backend, showToast);
  const [section, setSection] = useState<Section>(() => { const v = new URLSearchParams(location.search).get("section"); return isSection(v) ? v : "appearance"; });
  const sync = useRef(store.syncSettings); sync.current = store.syncSettings;
  useEffect(() => {
    const f = (e: Event) => showToast((e as CustomEvent<string>).detail); addEventListener("pb-toast", f);
    const offs = [listen<Settings>("settings-changed", (e) => sync.current(e.payload)), listen<string | null>("settings-section", (e) => { if (isSection(e.payload)) setSection(e.payload); })];
    return () => { removeEventListener("pb-toast", f); offs.forEach((p) => p.then((u) => u())); };
  }, [showToast]);
  return (
    <MotionRoot speed={store.snap ? motionSpeed(store.snap.settings) : 1}>
      <SettingsApp store={store} section={section} onSection={setSection} />
      <Toast message={toast} />
    </MotionRoot>
  );
}
