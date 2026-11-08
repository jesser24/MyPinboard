import type { Edge } from "./types";
import type { Binding } from "./shortcuts";

export type Theme = "system" | "dark" | "light";
export type Accent = "violet" | "azure" | "orchid" | "mint" | "coral" | "amber";
export type RowDensity = "comfortable" | "compact";
export type ViewMode = "list" | "grid";

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
}
export const DEFAULT_SETTINGS: Settings = {
  theme: "system", accent: "violet", transparency: 0.72, blur: 22, animSpeed: 1,
  edge: "right", offset: 0.5,
  capture: { enabled: true, text: true, urls: true, images: true, files: true, folders: true },
  maxItems: 500, excludedApps: ["KeePass.exe", "Bitwarden.exe", "1Password.exe"], startWithWindows: false, notifications: true,
  shortcuts: [
    { action: "toggle", keys: "Win+Alt+S" }, { action: "pause", keys: "Win+Alt+P" },
    { action: "capture", keys: "Win+Alt+C" }, { action: "search", keys: "Ctrl+F" },
  ],
  viewMode: "list", rowDensity: "comfortable", sidebarCollapsed: false, handleThickness: 10, handleLength: 100, handleIndicator: true,
};
/** One flat accent per choice. Text on accent is always white; accent-coloured text is mixed toward the ink colour in CSS for contrast. */
export const ACCENTS: Record<Accent, string> = {
  violet: "#7b6cf6", azure: "#2f8cf0", orchid: "#c45ee0", mint: "#1fae83", coral: "#ec5f5f", amber: "#d9912b",
};
export const HANDLE_WINDOW_DIP = 16;
export const ANIM_DURATION_MS = 280;

const clamp = (v: number, lo: number, hi: number, fallback: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Apply settings to CSS custom properties on <html>. */
export function applySettings(s: Settings, root: HTMLElement = document.documentElement) {
  const accent = ACCENTS[s.accent] ?? ACCENTS.violet;
  const t = clamp(s.handleThickness, 6, 12, 10);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--glass-alpha", String(s.transparency));
  root.style.setProperty("--blur", `${s.blur}px`);
  root.style.setProperty("--dur", s.animSpeed === 0 ? "0.01ms" : `${Math.round(ANIM_DURATION_MS / s.animSpeed)}ms`);
  root.style.setProperty("--handle-t", `${t}px`);
  root.style.setProperty("--handle-len", `${clamp(s.handleLength, 30, 100, 100)}%`);
  root.style.setProperty("--handle-grow", String(Math.round(Math.min(HANDLE_WINDOW_DIP / t, 1.4) * 100) / 100)); // hover growth that never leaves the 16 dip window
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
  return m;
}
