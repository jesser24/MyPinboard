import { useEffect, useState, type ReactNode } from "react";
import { HEX, normalizeHex } from "../../lib/settings";

export const Row = ({ label, hint, children, col }: { label: string; hint?: ReactNode; children: ReactNode; col?: boolean }) =>
  <div className={`s-row ${col ? "col" : ""}`}><div className="label"><b>{label}</b>{hint && <small>{hint}</small>}</div><div className="ctl">{children}</div></div>;

export const Switch = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) =>
  <button role="switch" className="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;

export const Seg = <T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) =>
  <div className="seg" role="radiogroup" aria-label={label}>{options.map(([v, l]) => <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;

export const Slider = ({ value, min, max, step, onChange, label, unit }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; unit: string }) =>
  <><input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(+e.target.value)} /><output>{value}{unit}</output></>;

export const Group = ({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) =>
  <section className="s-group"><h3>{title}</h3>{children}{note && <p className="s-note">{note}</p>}</section>;

/**
 * A colour setting: preset swatches, the system colour picker and a HEX field. `value === ""` means "automatic" (derived from the accent);
 * `auto` is the colour shown for that state. Invalid HEX is flagged and never saved.
 */
export function ColorField({ label, value, auto, presets, onChange, hint }: { label: string; value: string; auto: string; presets: string[]; onChange: (hex: string) => void; hint?: ReactNode }) {
  const shown = HEX.test(value) ? value : auto;
  const [txt, setTxt] = useState(value || ""); const [bad, setBad] = useState(false);
  useEffect(() => { setTxt(value || ""); setBad(false); }, [value]);
  const commit = (v: string) => { const n = normalizeHex(v); if (n) { setBad(false); onChange(n); } else if (v.trim() === "") { setBad(false); onChange(""); } else setBad(true); };
  return (
    <div className="s-row col color-row">
      <div className="label"><b>{label}</b>{hint && <small>{hint}</small>}</div>
      <div className="ctl cf">
        {presets.length > 0 && <div className="swatches" role="group" aria-label={`${label} presets`}>
          {presets.map((c) => <button key={c} type="button" title={c} aria-label={`${label} ${c}`} aria-pressed={value.toLowerCase() === c} style={{ background: c }} onClick={() => onChange(c)} />)}
        </div>}
        <label className="picker" title="Pick any colour"><input type="color" aria-label={`${label} picker`} value={shown} onChange={(e) => onChange(e.target.value)} /><i style={{ background: shown }} /></label>
        <input className={`field-input hex ${bad ? "bad" : ""}`} aria-label={`${label} HEX`} aria-invalid={bad} placeholder="Auto" spellCheck={false} maxLength={7} value={txt}
          onChange={(e) => { setTxt(e.target.value); setBad(false); }} onBlur={() => commit(txt)} onKeyDown={(e) => { if (e.key === "Enter") commit(txt); }} />
        {value && <button type="button" className="btn small" onClick={() => onChange("")}>Auto</button>}
      </div>
    </div>
  );
}
