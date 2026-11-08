import type { Edge } from "./types";
import type { Binding } from "./shortcuts";

export type Theme = "system" | "dark" | "light";
export type Accent = "violet" | "azure" | "orchid" | "mint" | "coral" | "amber";
export type RowDensity = "comfortable" | "compact";
export type ViewMode = "list" | "grid";
export type Material = "auto" | "acrylic" | "mica" | "glass";
export type AnimationId = "fade-scale" | "slide" | "spring" | "blur" | "expand" | "instant";
export type CopyBehavior = "close" | "stay";

export interface Settings {
  theme: Theme;
  accent: Accent;
  transparency: number; // 0.35..1 surface opacity
  blur: number;         // px, inner glass
  animSpeed: 0 | 0.5 | 1 | 1.5 | 2; // 0 = off
  edge: Edge;
  offset: number;
  capture: { enabled: boolean; text: boolean; urls: boolean; images: boolean; files: boolean; folders: boolean };
  maxItems: number;
  excludedApps: string[];
  startWithWindows: boolean;
  notifications: boolean;
  shortcuts: Binding[];
  // --- added by the redesign. The Rust core keeps unknown settings fields verbatim (`Settings.extra`), so no migration is needed. ---
  viewMode: ViewMode;
  rowDensity: RowDensity;
  sidebarCollapsed: boolean;
  /** Visible thickness of the edge tab in dip (the native handle window is 16 dip wide). */
  handleThickness: number;
  /** Length of the edge tab as a share of the handle window, in percent. */
  handleLength: number;
  /** Show a small dot on the edge tab while there are items you have not seen yet. */
  handleIndicator: boolean;

  // --- floating-glass redesign (all optional on disk; mergeSettings fills defaults, Rust keeps them verbatim in `extra`) ---
  /** Panel size in dip. The native window honours it (clamped to the screen); the browser preview too. */
  panelWidth: number; panelHeight: number;
  panelRadius: number;       // px, 8..28
  material: Material;        // native backdrop: auto = Mica, else Acrylic; glass = no native material (tint only)
  panelTint: string;         // "" = theme colour, else #rrggbb mixed into the surface
  borderOpacity: number;     // 0..0.5
  shadowIntensity: number;   // 0..1
  /** Toggle colours. "" = follow the accent / derive automatically. */
  toggleColor: string; toggleBg: string; toggleBorder: string; toggleGlow: string; toggleHover: string; toggleActive: string; toggleIndicator: string;
  toggleGlowOn: boolean; toggleGlowIntensity: number; // 0..1
  animation: AnimationId;
  /** Opening duration in ms (animSpeed 0 disables animation entirely). */
  animDuration: number;
  copyBehavior: CopyBehavior;   // close = the panel closes after you copy an item
  closeOnBlur: boolean;         // click outside / focus loss closes the panel
  retentionDays: number;        // 0 = keep forever; pinned and favourite items are never expired
}
export const DEFAULT_SETTINGS: Settings = {
  theme: "system", accent: "violet", transparency: 0.75, blur: 22, animSpeed: 1,
  edge: "right", offset: 0.5,
  capture: { enabled: true, text: true, urls: true, images: true, files: true, folders: true },
  maxItems: 500, excludedApps: ["KeePass.exe", "Bitwarden.exe", "1Password.exe"], startWithWindows: false, notifications: true,
  shortcuts: [
    { action: "toggle", keys: "Win+Alt+S" }, { action: "pause", keys: "Win+Alt+P" },
    { action: "capture", keys: "Win+Alt+C" }, { action: "search", keys: "Ctrl+F" },
  ],
  viewMode: "list", rowDensity: "comfortable", sidebarCollapsed: false, handleThickness: 10, handleLength: 100, handleIndicator: true,
  panelWidth: 380, panelHeight: 540, panelRadius: 20, material: "auto", panelTint: "", borderOpacity: 0.14, shadowIntensity: 0.4,
  toggleColor: "", toggleBg: "", toggleBorder: "", toggleGlow: "", toggleHover: "", toggleActive: "", toggleIndicator: "",
  toggleGlowOn: true, toggleGlowIntensity: 0.6,
  animation: "fade-scale", animDuration: 280, copyBehavior: "stay", closeOnBlur: true, retentionDays: 0,
};
export const PANEL_LIMITS = { minW: 320, maxW: 480, minH: 380, maxH: 700 } as const;
export const ANIMATION_IDS: AnimationId[] = ["fade-scale", "slide", "spring", "blur", "expand", "instant"];
export const MATERIALS: Material[] = ["auto", "acrylic", "mica", "glass"];
export const HEX = /^#[0-9a-f]{6}$/i;
/** Accepts "#abc", "abc", "#aabbcc"; returns lower-case "#rrggbb" or null. */
export function normalizeHex(v: string): string | null {
  const t = v.trim().replace(/^#/, "").toLowerCase();
  const f = /^[0-9a-f]{3}$/.test(t) ? t.split("").map((c) => c + c).join("") : t;
  return /^[0-9a-f]{6}$/.test(f) ? `#${f}` : null;
}
export const TOGGLE_PRESETS: { name: string; color: string }[] = [
  { name: "Violet", color: "#7b6cf6" }, { name: "Azure", color: "#2f8cf0" }, { name: "Mint", color: "#1fae83" }, { name: "Coral", color: "#ec5f5f" },
  { name: "Amber", color: "#d9912b" }, { name: "Orchid", color: "#c45ee0" }, { name: "Graphite", color: "#8c93a6" }, { name: "White", color: "#f2f3f7" },
];
/** One flat accent per choice. Text on accent is always white; accent-coloured text is mixed toward the ink colour in CSS for contrast. */
export const ACCENTS: Record<Accent, string> = {
  violet: "#7b6cf6", azure: "#2f8cf0", orchid: "#c45ee0", mint: "#1fae83", coral: "#ec5f5f", amber: "#d9912b",
};
export const HANDLE_WINDOW_DIP = 16;
export const ANIM_DURATION_MS = 280;

/** Speed multiplier for the small interface animations (menus, rows, toasts): 0 = off, otherwise follows the chosen opening duration. */
export function motionSpeed(s: Pick<Settings, "animSpeed" | "animDuration">): number {
  if (s.animSpeed === 0) return 0;
  const d = Number.isFinite(s.animDuration) ? s.animDuration : ANIM_DURATION_MS;
  return Math.min(2.5, Math.max(0.4, ANIM_DURATION_MS / d)) * (s.animSpeed || 1);
}
/** How long the panel needs to finish closing (ms), so the window is only hidden afterwards. */
export function closeMs(s: Pick<Settings, "animSpeed" | "animDuration">): number { return s.animSpeed === 0 ? 0 : Math.round(s.animDuration * 0.7) + 40; }

const clamp = (v: number, lo: number, hi: number, fallback: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Apply settings to CSS custom properties on <html>. */
export function applySettings(s: Settings, root: HTMLElement = document.documentElement) {
  const accent = ACCENTS[s.accent] ?? ACCENTS.violet;
  const t = clamp(s.handleThickness, 6, 12, 10);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--glass-alpha", String(s.transparency));
  root.style.setProperty("--blur", `${s.blur}px`);
  root.style.setProperty("--dur", s.animSpeed === 0 ? "0.01ms" : `${Math.round(clamp(s.animDuration, 60, 900, ANIM_DURATION_MS))}ms`);
  root.style.setProperty("--handle-t", `${t}px`);
  root.style.setProperty("--handle-len", `${clamp(s.handleLength, 30, 100, 100)}%`);
  root.style.setProperty("--handle-grow", String(Math.round(Math.min(HANDLE_WINDOW_DIP / t, 1.4) * 100) / 100)); // hover growth that never leaves the 16 dip window
  const w = clamp(s.panelWidth, PANEL_LIMITS.minW, PANEL_LIMITS.maxW, 380), h = clamp(s.panelHeight, PANEL_LIMITS.minH, PANEL_LIMITS.maxH, 540);
  root.style.setProperty("--panel-w", `${w}px`); root.style.setProperty("--panel-h", `${h}px`);
  root.style.setProperty("--panel-r", `${clamp(s.panelRadius, 8, 28, 20)}px`);
  root.style.setProperty("--panel-border", String(clamp(s.borderOpacity, 0, 0.5, 0.14)));
  const sh = clamp(s.shadowIntensity, 0, 1, 0.4);
  root.style.setProperty("--panel-shadow", sh === 0 ? "none" : `0 ${Math.round(14 + 16 * sh)}px ${Math.round(30 + 40 * sh)}px rgb(0 0 0 / ${(0.12 + 0.4 * sh).toFixed(2)}), 0 2px 8px rgb(0 0 0 / ${(0.08 + 0.22 * sh).toFixed(2)})`);
  const tint = HEX.test(s.panelTint) ? s.panelTint : "";
  if (tint) root.style.setProperty("--panel-tint", tint); else root.style.removeProperty("--panel-tint");
  root.dataset.tint = tint ? "on" : "off"; root.dataset.material = s.material;
  const tg: [string, string][] = [["--tg-main", s.toggleColor], ["--tg-bg", s.toggleBg], ["--tg-border", s.toggleBorder], ["--tg-glow", s.toggleGlow], ["--tg-hover", s.toggleHover], ["--tg-active", s.toggleActive], ["--tg-dot", s.toggleIndicator]];
  for (const [k, v] of tg) { if (HEX.test(v)) root.style.setProperty(k, v); else root.style.removeProperty(k); }
  const gi = clamp(s.toggleGlowIntensity, 0, 1, 0.6);
  root.style.setProperty("--tg-glow-pct", s.toggleGlowOn ? `${Math.round(15 + 65 * gi)}%` : "0%");
  root.style.setProperty("--tg-glow-blur", s.toggleGlowOn ? `${Math.round(8 + 16 * gi)}px` : "0px");
  root.dataset.theme = s.theme;
  root.dataset.indicator = s.handleIndicator ? "on" : "off";
  root.dataset.motion = s.animSpeed === 0 ? "off" : "on";
}

/** Fill every missing or out-of-range field with a default. Needed because the native backend returns the stored JSON as is. */
export function mergeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const m: Settings = { ...DEFAULT_SETTINGS, ...r, capture: { ...DEFAULT_SETTINGS.capture, ...(r.capture ?? {}) },
    shortcuts: Array.isArray(r.shortcuts) && r.shortcuts.length ? r.shortcuts : DEFAULT_SETTINGS.shortcuts };
  if (!(m.accent in ACCENTS)) m.accent = DEFAULT_SETTINGS.accent;
  if (m.viewMode !== "list" && m.viewMode !== "grid") m.viewMode = "list";
  if (m.rowDensity !== "comfortable" && m.rowDensity !== "compact") m.rowDensity = "comfortable";
  m.handleThickness = clamp(m.handleThickness, 6, 12, 10);
  m.handleLength = clamp(m.handleLength, 30, 100, 100);
  m.sidebarCollapsed = !!m.sidebarCollapsed; m.handleIndicator = m.handleIndicator !== false;
  m.panelWidth = Math.round(clamp(m.panelWidth, PANEL_LIMITS.minW, PANEL_LIMITS.maxW, 380)); m.panelHeight = Math.round(clamp(m.panelHeight, PANEL_LIMITS.minH, PANEL_LIMITS.maxH, 540));
  m.panelRadius = Math.round(clamp(m.panelRadius, 8, 28, 20)); m.borderOpacity = clamp(m.borderOpacity, 0, 0.5, 0.14); m.shadowIntensity = clamp(m.shadowIntensity, 0, 1, 0.4);
  if (!MATERIALS.includes(m.material)) m.material = "auto";
  if (!ANIMATION_IDS.includes(m.animation)) m.animation = "fade-scale";
  m.animDuration = Math.round(clamp(m.animDuration, 60, 900, ANIM_DURATION_MS));
  if (m.copyBehavior !== "close" && m.copyBehavior !== "stay") m.copyBehavior = "stay";
  m.closeOnBlur = m.closeOnBlur !== false; m.toggleGlowOn = m.toggleGlowOn !== false; m.toggleGlowIntensity = clamp(m.toggleGlowIntensity, 0, 1, 0.6);
  m.retentionDays = Math.round(clamp(m.retentionDays, 0, 3650, 0));
  for (const k of ["panelTint", "toggleColor", "toggleBg", "toggleBorder", "toggleGlow", "toggleHover", "toggleActive", "toggleIndicator"] as const) m[k] = typeof m[k] === "string" && HEX.test(m[k]) ? m[k].toLowerCase() : "";
  // Initial surface opacity is 75 % (older installs keep whatever they chose; only the untouched legacy default moves).
  if (r.transparency === undefined || r.transparency === 0.72) m.transparency = 0.75;
  m.transparency = clamp(m.transparency, 0.35, 1, 0.75);
  return m;
}
