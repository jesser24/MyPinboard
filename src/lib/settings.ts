import type { Edge } from "./types";
import type { Binding } from "./shortcuts";

export type Theme = "system" | "dark" | "light";
export interface Settings {
  theme: Theme;
  accent: "violet" | "azure" | "orchid" | "mint";
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
};
export const ACCENTS: Record<Settings["accent"], [string, string]> = {
  violet: ["#8b6cf7", "#3b82f6"], azure: ["#38bdf8", "#4f6bf5"], orchid: ["#d86cf0", "#7c5cf5"], mint: ["#34d399", "#38bdf8"],
};
export const ANIM_DURATION_MS = 280;

/** Apply settings to CSS custom properties on <html>. */
export function applySettings(s: Settings, root: HTMLElement = document.documentElement) {
  const [a, b] = ACCENTS[s.accent];
  root.style.setProperty("--accent-a", a);
  root.style.setProperty("--accent-b", b);
  root.style.setProperty("--glass-alpha", String(s.transparency));
  root.style.setProperty("--blur", `${s.blur}px`);
  root.style.setProperty("--dur", s.animSpeed === 0 ? "0.01ms" : `${Math.round(ANIM_DURATION_MS / s.animSpeed)}ms`);
  root.dataset.theme = s.theme;
}
export function mergeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...r, capture: { ...DEFAULT_SETTINGS.capture, ...(r.capture ?? {}) },
    shortcuts: Array.isArray(r.shortcuts) && r.shortcuts.length ? r.shortcuts : DEFAULT_SETTINGS.shortcuts };
}
