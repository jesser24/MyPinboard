import { TOGGLE_PRESETS, type Settings } from "../../lib/settings";
import type { Edge } from "../../lib/types";
import type { Store } from "../../lib/store";
import { ColorField, Group, Row, Seg, Slider, Switch } from "./controls";

type ColorKey = "toggleColor" | "toggleBg" | "toggleBorder" | "toggleGlow" | "toggleHover" | "toggleActive" | "toggleIndicator";
const FIELDS: { key: ColorKey; label: string; hint: string; auto: string }[] = [
  { key: "toggleColor", label: "Main colour", hint: "The tab itself. Auto follows the accent.", auto: "#9b8ff8" },
  { key: "toggleHover", label: "Hover colour", hint: "While the pointer is over the tab.", auto: "#9b8ff8" },
  { key: "toggleActive", label: "Active colour", hint: "While the panel is open.", auto: "#9b8ff8" },
  { key: "toggleBg", label: "Background colour", hint: "A faint rail behind the tab (visible on shorter tabs).", auto: "#8c93a6" },
  { key: "toggleBorder", label: "Border colour", hint: "Outline of the tab.", auto: "#ffffff" },
  { key: "toggleGlow", label: "Glow colour", hint: "Halo around the tab.", auto: "#7b6cf6" },
  { key: "toggleIndicator", label: "New-item indicator", hint: "The small light shown after you copy something new.", auto: "#ffffff" },
];

/** Live preview of the real tab styles in its four states. Uses the same markup and CSS as the edge tab, so colour changes show up at once. */
export function TogglePreview({ s }: { s: Settings }) {
  const states: [string, string, boolean][] = [["Normal", "", false], ["Hover", "force-hover", false], ["Open", "active", false], ["New item", "", true]];
  return (
    <div className="tg-preview" aria-label="Toggle preview">
      {states.map(([name, cls, unseen]) => (
        <figure key={name}>
          <div className="tg-stage"><div className={`handle v ${cls}`} data-edge="right" data-unseen={unseen} aria-hidden><span /></div></div>
          <figcaption>{name}</figcaption>
        </figure>
      ))}
      <p className="s-note" style={{ gridColumn: "1/-1" }}>{s.toggleGlowOn ? "Glow on" : "Glow off"} · {s.handleThickness}px × {s.handleLength}%</p>
    </div>
  );
}

export function ToggleSettings({ store }: { store: Store }) {
  const s = store.snap!.settings; const set = store.setSettings;
  return <>
    <Group title="Colours" note="Pick a preset, use the colour picker, or type a HEX value. “Auto” follows your accent colour. Changes apply to the real edge tab immediately.">
      <Row col label="Presets" hint="Sets the main colour in one click."><div className="swatches big" role="group" aria-label="Toggle colour presets">
        {TOGGLE_PRESETS.map((p) => <button key={p.color} title={p.name} aria-label={`Toggle colour ${p.name}`} aria-pressed={s.toggleColor === p.color} style={{ background: p.color }} onClick={() => set({ toggleColor: p.color, toggleGlow: "", toggleHover: "", toggleActive: "" })} />)}
      </div></Row>
      {FIELDS.map((f) => <ColorField key={f.key} label={f.label} hint={f.hint} value={s[f.key]} auto={f.auto} presets={[]} onChange={(v) => set({ [f.key]: v } as Partial<Settings>)} />)}
    </Group>
    <Group title="Glow">
      <Row label="Glow" hint="A soft halo around the tab."><Switch label="Glow" on={s.toggleGlowOn} onChange={(v) => set({ toggleGlowOn: v })} /></Row>
      <Row col label="Glow intensity"><Slider label="Glow intensity" value={Math.round(s.toggleGlowIntensity * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => set({ toggleGlowIntensity: v / 100 })} /></Row>
      <Row label="New item indicator" hint="Show a small light on the tab while there is something you have not seen."><Switch label="New item indicator" on={s.handleIndicator} onChange={(v) => set({ handleIndicator: v })} /></Row>
    </Group>
    <Group title="Shape and position" note="You can also drag the tab itself to any screen edge. Its hit area is always 16 px wide, whatever the visible thickness.">
      <Row col label="Visual thickness" hint="How far the tab reaches in from the screen edge."><Slider label="Tab thickness" value={s.handleThickness} min={6} max={12} step={1} unit=" px" onChange={(v) => set({ handleThickness: v })} /></Row>
      <Row col label="Length" hint="Shorter tabs stay out of the way of window controls."><Slider label="Tab length" value={s.handleLength} min={30} max={100} step={5} unit="%" onChange={(v) => set({ handleLength: v })} /></Row>
      <Row col label="Screen edge"><Seg<Edge> label="Screen edge" value={s.edge} onChange={(v) => set({ edge: v })} options={[["left", "Left"], ["right", "Right"], ["top", "Top"], ["bottom", "Bottom"]]} /></Row>
      <Row col label="Position along the edge"><Slider label="Position along the edge" value={Math.round(s.offset * 100)} min={10} max={90} step={1} unit="%" onChange={(v) => set({ offset: v / 100 })} /></Row>
    </Group>
  </>;
}
