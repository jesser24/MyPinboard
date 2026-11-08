import { ACCENTS, DEFAULT_SETTINGS, PANEL_LIMITS, normalizeHex, type Accent, type Material } from "../../lib/settings";
import type { Store } from "../../lib/store";
import { ColorField, Group, Row, Seg, Slider } from "./controls";

const OPACITY_PRESETS = [100, 90, 80, 75, 70, 60];
const TINTS = ["#7b6cf6", "#2f8cf0", "#1fae83", "#d9912b", "#ec5f5f", "#8c93a6"];
const MATERIAL_HINT: Record<Material, string> = {
  auto: "Mica where Windows 11 offers it, otherwise Acrylic.",
  acrylic: "Frosted, blurs what is behind the panel.",
  mica: "Soft wallpaper-tinted material (Windows 11).",
  glass: "No Windows material: a see-through tinted surface. Allows any corner radius.",
};

export function Appearance({ store, native }: { store: Store; native: boolean }) {
  const s = store.snap!.settings; const set = store.setSettings;
  const pct = Math.round(s.transparency * 100);
  return <>
    <Group title="Theme">
      <Row label="Colour scheme"><Seg label="Colour scheme" value={s.theme} onChange={(v) => set({ theme: v })} options={[["system", "System"], ["dark", "Dark"], ["light", "Light"]]} /></Row>
      <Row label="Accent colour" hint="Buttons, focus and highlights."><div className="swatches">{(Object.keys(ACCENTS) as Accent[]).map((k) => <button key={k} aria-label={k} title={k} aria-pressed={s.accent === k} style={{ background: ACCENTS[k] }} onClick={() => set({ accent: k })} />)}</div></Row>
    </Group>

    <Group title="Panel surface" note="Only the panel's background becomes see-through. Text, icons and thumbnails always stay fully opaque.">
      <Row col label="Surface opacity" hint="Starts at 75 %.">
        <div className="seg" role="radiogroup" aria-label="Opacity presets">{OPACITY_PRESETS.map((v) => <button key={v} role="radio" aria-checked={pct === v} className={pct === v ? "on" : ""} onClick={() => set({ transparency: v / 100 })}>{v}%</button>)}</div>
        <div className="slide"><Slider label="Surface opacity" value={pct} min={35} max={100} step={1} unit="%" onChange={(v) => set({ transparency: v / 100 })} /></div>
      </Row>
      <Row col label="Blur" hint={native ? "Used by the Glass material and the preview. Mica and Acrylic have their own blur from Windows." : "Blur behind the panel."}><Slider label="Blur" value={s.blur} min={0} max={40} step={1} unit=" px" onChange={(v) => set({ blur: v })} /></Row>
      <Row col label="Material" hint={MATERIAL_HINT[s.material]}>
        <Seg label="Material" value={s.material} onChange={(v) => set({ material: v })} options={[["auto", "Auto"], ["acrylic", "Acrylic"], ["mica", "Mica"], ["glass", "Glass"]]} />
        {!native && <p className="s-note inline">Windows materials only exist in the Windows app. This preview draws a CSS approximation.</p>}
      </Row>
      <ColorField label="Background tint" value={s.panelTint} auto="#8c93a6" presets={TINTS} onChange={(v) => set({ panelTint: v })} hint="Mixed gently into the surface. Auto follows the theme." />
      <Row col label="Border" hint="Opacity of the soft outline."><Slider label="Border opacity" value={Math.round(s.borderOpacity * 100)} min={0} max={50} step={1} unit="%" onChange={(v) => set({ borderOpacity: v / 100 })} /></Row>
      <Row col label="Shadow" hint={native ? "Windows draws the shadow of the native panel; this controls the preview." : "Depth under the panel."}><Slider label="Shadow intensity" value={Math.round(s.shadowIntensity * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => set({ shadowIntensity: v / 100 })} /></Row>
      <Row col label="Corner radius" hint={native ? "Windows rounds Mica and Acrylic panels itself (8 px). Choose Glass to use your own radius." : undefined}><Slider label="Corner radius" value={s.panelRadius} min={8} max={28} step={1} unit=" px" onChange={(v) => set({ panelRadius: v })} /></Row>
    </Group>

    <Group title="Panel size">
      <Row col label="Width" hint="The panel never grows beyond the screen."><Slider label="Panel width" value={s.panelWidth} min={PANEL_LIMITS.minW} max={PANEL_LIMITS.maxW} step={10} unit=" px" onChange={(v) => set({ panelWidth: v })} /></Row>
      <Row col label="Height"><Slider label="Panel height" value={s.panelHeight} min={PANEL_LIMITS.minH} max={PANEL_LIMITS.maxH} step={10} unit=" px" onChange={(v) => set({ panelHeight: v })} /></Row>
      <div className="row"><button className="btn small" onClick={() => set({ panelWidth: DEFAULT_SETTINGS.panelWidth, panelHeight: DEFAULT_SETTINGS.panelHeight, transparency: DEFAULT_SETTINGS.transparency, blur: DEFAULT_SETTINGS.blur, panelRadius: DEFAULT_SETTINGS.panelRadius, borderOpacity: DEFAULT_SETTINGS.borderOpacity, shadowIntensity: DEFAULT_SETTINGS.shadowIntensity, panelTint: "", material: "auto" })}>Reset panel appearance</button></div>
    </Group>
  </>;
}
export { normalizeHex };
