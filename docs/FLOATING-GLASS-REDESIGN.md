# Floating glass redesign

MyPinboard is a floating clipboard panel plus a separate window for everything else.

## Two experiences
- **Floating panel** (click the edge toggle): header (name, settings, close), search, recent items, footer. No sidebar, categories, collections or settings. Click an item to copy it; the trash button (top-right of every item) deletes it at once, with a 6 s Undo toast. Every item shows its stored capture time (`Today · 17:24`, tooltip with the full timestamp).
- **MyPinboard window** (settings icon, tray menu "Settings", footer "Open MyPinboard"): Appearance, Toggle, Animations, Clipboard, Behavior, Privacy, Library (collections, favourites, tags, bulk actions, command palette), About.

## Settings storage (no database migration)
All new preferences live in `Settings.extra` (serde `flatten`), which already round-trips unknown keys. Old databases load with defaults; the untouched legacy 72 % surface becomes the new 75 % default.
`panelWidth/panelHeight` (320–480 × 380–700), `panelRadius`, `material` (auto|acrylic|mica|glass), `panelTint`, `borderOpacity`, `shadowIntensity`, `toggle*` colours, `toggleGlowOn/Intensity`, `animation` (fade-scale|slide|spring|blur|expand|instant), `animDuration`, `copyBehavior`, `closeOnBlur`, `retentionDays`.

## Rust changes (small, isolated)
- `crates/core`: `Settings::panel_size()`, `Settings::material()`, `geometry::board_rect_sized` / `panel_size_logical` (unit-tested; the old `board_rect` is unchanged).
- `src-tauri`: `open_settings` command + `shell::show_settings` (separate window), panel size from settings, native backdrop chosen by `material`, toggle edge/position applied from settings, tray "Settings" item, `settings` window in the capability.
The clipboard engine, ingestion, database and edge-handle windowing are untouched.

## Honest limits
- Mica/Acrylic come from Windows. With a native material Windows rounds the panel itself (8 px); a custom corner radius and the CSS shadow only apply to the `glass` material and the browser preview.
- Retention is applied when the panel/window loads, not by a background job.
- Backup export does not embed image files.
- Not verified in this environment: the Windows build, installer/portable builds, native windows, Mica/Acrylic, DPI behaviour. The browser tests (`npm run e2e:browser`) run Chromium against the preview only.
