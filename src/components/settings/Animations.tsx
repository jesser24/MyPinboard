import { useEffect, useState } from "react";
import { ANIMATIONS, SPEEDS, speedOf } from "../../lib/panelAnim";
import type { AnimationId } from "../../lib/settings";
import type { Store } from "../../lib/store";
import { Icon } from "../Ui";
import { Group, Row, Seg, Slider } from "./controls";

const useReducedMotion = () => {
  const [r, setR] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { if (typeof matchMedia !== "function") return; const q = matchMedia("(prefers-reduced-motion: reduce)"); const f = () => setR(q.matches); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return r;
};

/** `replay` bumps whenever a preview is requested; the preview panel (real component) closes and opens again with the current animation. */
export function AnimationSettings({ store, onReplay }: { store: Store; onReplay(): void }) {
  const s = store.snap!.settings; const set = store.setSettings; const reduced = useReducedMotion();
  const [custom, setCustom] = useState(speedOf(s.animDuration) === "custom");
  const off = s.animSpeed === 0; const speed = off ? "off" : custom ? "custom" : speedOf(s.animDuration);
  const pick = (id: AnimationId) => { set({ animation: id }); window.setTimeout(onReplay, 30); };
  return <>
    <Group title="Opening animation" note="Every animation runs on the real panel, both here and when you click the edge tab.">
      <div className="anim-grid" role="radiogroup" aria-label="Opening animation">
        {ANIMATIONS.map((a) => (
          <button key={a.id} role="radio" aria-checked={s.animation === a.id} className={`anim-opt ${s.animation === a.id ? "on" : ""}`} data-anim={a.id} onClick={() => pick(a.id)}>
            <b>{a.label}</b><small>{a.hint}</small>
          </button>))}
      </div>
      <div className="row" style={{ marginTop: 12 }}><button className="btn primary" onClick={onReplay} aria-label="Preview animation"><Icon name="play" />Preview</button></div>
    </Group>
    <Group title="Speed">
      <Row col label="Speed" hint={off ? "Animation is disabled: the panel appears and disappears instantly." : `Opening takes ${s.animDuration} ms; closing is a little quicker.`}>
        <Seg<string> label="Animation speed" value={speed} onChange={(v) => {
          if (v === "off") set({ animSpeed: 0 });
          else if (v === "custom") { setCustom(true); set({ animSpeed: 1 }); }
          else { const p = SPEEDS.find((x) => x.id === v)!; setCustom(false); set({ animSpeed: 1, animDuration: p.ms }); window.setTimeout(onReplay, 30); }
        }} options={[["off", "Off"], ["fast", "Fast"], ["normal", "Normal"], ["slow", "Slow"], ["custom", "Custom"]]} />
      </Row>
      {!off && speed === "custom" && <Row col label="Duration"><Slider label="Animation duration" value={s.animDuration} min={80} max={800} step={20} unit=" ms" onChange={(v) => set({ animDuration: v })} /></Row>}
      <Row label="Reduced motion" hint={reduced ? "Windows asks for reduced motion: movement is replaced by simple fades." : "Follows the Windows “Show animations” setting automatically."}><span className={`pill ${reduced ? "on" : ""}`}>{reduced ? "On" : "Off"}</span></Row>
    </Group>
  </>;
}
