# Development log

## 2026-11-05 — Checkpoint 1 (Linux sandbox)
Done and executed here:
- Researched Tack (C#/WPF, MIT). Concept only; no code reused.
- Verified skills exist: frontend-design (read), responsive-design, Superpowers (brainstorming, writing-plans, TDD, systematic-debugging, verification-before-completion), Anthropic skills. Not installed as plugins; methodologies followed manually.
- Icon set generated from supplied image: ICO (16-256), PNGs, tray, Start Menu tiles. Palette sampled: navy #29104c, violet #5a4c99, blue #1949b4.
- ARCHITECTURE.md decision record written.
- Pure TS modules with tests: adaptive layout, search/filter/sort, duplicate keys, shortcut conflicts. `vitest`: 54/54 passing (run in sandbox).

Not started: React UI, design tokens/CSS, Rust backend, SQLite, Quick Review engines, tray/hotkeys, CI workflows, installer, portable build, release ZIP.
Not verifiable here: everything Windows-specific. No Rust toolchain in sandbox, so Rust code will first compile on the Windows runner.

## 2026-11-05 — Checkpoint 2: complete React UI (Linux sandbox)
Implemented (all exercised in headless Chromium, see below):
- Edge handle: permanent 10 px glass tab on any of 4 edges, draggable along/between edges with snap guides, click toggles, hover/focus effect, keyboard (Enter/Space), larger hit area, position persisted, recovery on invalid area.
- Board: slide + scale + opacity animation (≈280 ms spring easing, per-edge direction, speed setting incl. off, reduced-motion respected), reverse on close, Esc / outside click, not closed during file drag or move. Movable by grip, docks to nearest edge.
- Content: paste (Ctrl+V) and drop capture for text, URLs, images, files; duplicate bump; max-items eviction that spares pinned/favourites.
- Cards: thumbnail/snippet/type glyph, name, type, size, time, tags; click = copy, double-click = edit text / zoom image / open link, context menu (copy, open, edit, show in folder, pin, favourite, rename, tag, move, remove with confirmation).
- Instant accent-insensitive multi-token search, kind filters, favourites, tag filter, sort, collections (create/rename/delete/move).
- Settings: theme system/dark/light, accent, transparency, blur, animation speed, capture toggles, max items, excluded apps, editable shortcuts with conflict detection, backup export / restore, clear history.
- Adaptive layout: board size, density tiers, columns, fluid font; 44 px touch targets on coarse pointers.
- Opaque fallback when backdrop-filter / transparency unavailable.
Fixed during testing: card rows were compressed (labels clipped), snippet clipping, truncated placeholder, unclear scroll cue on tabs.

## Test evidence (executed here)
- `vitest`: 227/227 (layout matrix, edge geometry, capture/dedupe/eviction, search, shortcuts, persistence incl. corrupted storage).
- `tsc --noEmit`: clean. `vite build`: OK (≈177 kB JS / 58 kB gz).
- `scripts/e2e_browser.py` (Playwright, Chromium 153 on Linux): 99/99 checks, incl. 9 resolutions/DPR × 2 themes with no-clip / no-overlap / no-squash assertions. Screenshots in `shots/`.

## NOT verified
Everything native: real clipboard watching, OS file drag-in/out with real paths, Mica/Acrylic, global hotkeys, tray, autostart, multi-monitor/mixed DPI, installer, portable build. Browser preview uses an in-app wallpaper and in-app blur only. Touch not tested.

## Next
Step 2: Rust/Tauri backend (SQLite, clipboard listener, windows, hotkeys, tray) behind the existing `Backend` interface; Step 3: Quick Review engines; Step 4: CI workflows.

## Checkpoint 3 — Rust/Tauri backend
- Workspace: `crates/core` + `src-tauri`. Core 32 tests, app 5 tests, all executed. Windows code and the real-Windows integration tests type-check against Win32 (cross-check) — not executed.
- Found by tests: URL classification differed between Rust and TS (`http://`). Fixed.
- Found by review: npm Tauri packages (2.1.x) mismatched the Rust crate (2.12.5), which makes `tauri build` abort. Aligned to 2.12.4.
- Found by review: `generate_context!` needs `dist/` at compile time → CI builds the front-end before Rust tests.
- Sandbox-only: rust-src from Debian lacks the `windows-targets` dependency in std's manifest; patched locally for the cross-check (not part of the project).
- CI written (web / core / windows). Release workflow and ZIP assembly: next.
