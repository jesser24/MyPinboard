# MyPinboard — Architecture Decision Record

Status: accepted. Authoring environment: Linux sandbox. Windows behaviour is verified only by the Windows CI (see TEST_REPORT.md).

## 1. Research findings

### Original Tack (MIT, C# / WPF / .NET)
Studied for concept only; no code is copied. Relevant techniques it confirms as viable on Windows:
- Edge strip implemented as a separate always-on-top window plus low-level pointer detection (`Edge/Overlay.cs`, `StripThread.cs`).
- Global shortcuts through `RegisterHotKey` (`Hotkeys/GlobalHotkeys.cs`).
- Foreground/focus handling and click-through through raw Win32 (`Foreground/Focus.cs`, `Windowing/SeeThrough.cs`).
Limitations MyPinboard deliberately changes: Tack hides the strip fully off-screen, is top-edge only, is pinboard-skeuomorphic (felt), and has no document preview.

### Technology comparison
Ratings are qualitative engineering judgement from documented capabilities, not benchmarks. No memory/CPU figures are claimed until measured in CI.

| Criterion | WinUI 3 | WPF | Avalonia | **Tauri 2 + React** | Electron |
|---|---|---|---|---|---|
| Win32 integration (clipboard listener, hotkeys, DWM) | Excellent (C#/CsWin32) | Excellent | Good (P/Invoke) | **Excellent (Rust `windows` crate)** | Fair (native addons) |
| Real desktop Mica/Acrylic | Native | Via DWM P/Invoke | Partial | **Via `window-vibrancy` (Mica, Acrylic, Tabbed)** | Built-in `backgroundMaterial` |
| Animation / glass styling freedom | Good, hard to customise | Limited GPU effects | Good | **Excellent (CSS, GPU compositing)** | Excellent |
| Document preview ecosystem | Weak (must port) | Weak | Weak | **Strong (pdf.js, SheetJS, mammoth, Shiki, JSZip)** | Strong |
| Idle footprint | Low | Low | Low-medium | **Low (system WebView2, no bundled Chromium)** | Highest (bundled Chromium) |
| Installer | MSIX / fragile unpackaged | ClickOnce / WiX | Manual | **NSIS from `tauri build`** | NSIS/Squirrel |
| Multi-monitor / DPI APIs | Good | Good (per-monitor v2 needs care) | Good | **Good (Tauri monitor API + Win32)** | Good |
| Maintainability | Medium (churn) | High but legacy | Medium | **High (two mainstream stacks)** | High |

### Decision
**Tauri 2 (Rust core) + React/TypeScript UI on WebView2 + SQLite (rusqlite, bundled).**
- Rust owns everything that must be reliable and native: clipboard listener thread, hotkeys, edge window geometry, DB, file access, archive listing.
- The UI layer owns presentation, glass styling, animation and Quick Review rendering.
- Electron rejected: its bundled Chromium costs resident memory with no capability we need that WebView2 lacks.
- WinUI 3 rejected: weaker preview ecosystem and packaging friction outweigh native controls; glass is richer in CSS plus real backdrop.

## 2. Process model
- One Rust process, two Tauri windows:
  1. `edge` — tiny frameless, transparent, always-on-top, no-taskbar window (the permanent handle, never fully off-screen).
  2. `board` — frameless transparent window with real backdrop material; shown/hidden with animation driven by the UI.
  3. `review` — created on demand for Quick Review.
- Single instance via `tauri-plugin-single-instance`.
- All persistence local: `%APPDATA%\MyPinboard\` (installed) or `.\data\` beside the exe (portable, detected by a `portable.flag` file).

## 3. Module map
```
src-tauri/src/
  main.rs / lib.rs     bootstrap, plugins, single instance, tray
  geometry.rs          PURE: edge placement, snapping, monitor clamping (unit-tested)
  hashing.rs           PURE: content hash for duplicate detection (unit-tested)
  db.rs                SQLite schema, migrations, queries
  clipboard.rs         AddClipboardFormatListener on a message-only window (Windows only)
  commands.rs          Tauri commands exposed to UI
  settings.rs          typed settings, JSON persistence
src/
  lib/layout.ts        PURE: adaptive panel size, columns, density tiers (unit-tested)
  lib/search.ts        PURE: instant search/filter/sort (unit-tested)
  lib/dedupe.ts        PURE: UI-side duplicate keys (unit-tested)
  lib/preview/         Quick Review engines (lazy-loaded, offline)
  styles/tokens.css    design tokens from the icon palette
  components/          Board, Card, EdgeHandle, Settings, QuickReview
```

## 4. Clipboard design
- Event-driven: `AddClipboardFormatListener` on a hidden message-only window; `WM_CLIPBOARDUPDATE` triggers a read. Zero polling.
- Format priority: `CF_HDROP` (files/folders) > `CF_DIB/CF_DIBV5`/PNG (images) > `HTML Format` > `CF_UNICODETEXT`. URLs detected from text.
- Read-only: the clipboard is never written during capture. Retry with back-off on `ERROR_ACCESS_DENIED`.
- Self-copy loop guard: app writes are tagged with a sequence number (`GetClipboardSequenceNumber`) that capture ignores.
- Excluded apps matched by foreground process name at event time.
- Duplicate detection: SHA-256 of normalised payload; repeat copies bump `captured_at` instead of inserting.

## 5. Edge handle and board
- Handle: 10 DIP visible tab (configurable 6–14), rounded, glass, always on the chosen monitor edge; position stored as monitor id + edge + fractional offset along that edge, so it survives resolution/DPI changes.
- Open: UI animates 280 ms spring-like ease (`cubic-bezier(.2,.9,.25,1.05)`) with opacity; Rust only moves/shows the window. Close on outside click (blur) or Esc, suppressed while an OS drag is in flight.
- Monitor loss: on `WM_DISPLAYCHANGE`/monitor event, `geometry::clamp_to_monitor` re-homes to the primary monitor.
- Rust geometry is pure and tested without a display.

## 6. Material strategy
1. Windows 11 22H2+: Mica (board body) / Acrylic (handle, tooltips) via `window-vibrancy`.
2. Windows 10 / Windows 11 older: Acrylic where available.
3. Transparency disabled (system setting, or user toggle) or unsupported: opaque tokens with same layout. Readability tokens always enforce contrast over any translucency.
In-app CSS blur is used only for inner layers (cards, popovers) and never described as desktop blur.

## 7. Quick Review engine choices (all offline)
| Format | Engine | Licence | Notes |
|---|---|---|---|
| PDF | pdf.js (`pdfjs-dist`) in worker | Apache-2.0 | text layer, search, thumbnails. PDFium rejected: needs native binary packaging per arch. |
| DOCX | `mammoth` → sanitised HTML | BSD-2 | no macros, scripts stripped by DOMPurify. `.doc` legacy: not supported; clear message offered. |
| XLSX/XLS/CSV | SheetJS community edition | Apache-2.0 | values only, no formula/macro execution. |
| PPTX | JSZip + own slide XML parser | MIT/GPL-or-MIT | text, tables, images; faithful layout is approximate. `.ppt` not supported. |
| Code/text | Shiki | MIT | lazy language load. |
| Markdown | marked + DOMPurify | MIT / Apache-2.0 | |
| Images | native `<img>`; TIFF not supported by WebView2 | – | listed as limitation. |
| Archives | ZIP: JSZip (list only). 7Z/RAR: **not in v1.0** | – | explicit extraction via Rust `zip` crate with path-traversal guard. |
LibreOffice headless rejected for v1: ~300 MB runtime, breaks "lightweight".
Sandbox: previews render in an iframe with `sandbox` (no scripts, no same-origin), strict CSP, no network.

## 8. Known limitations accepted up front
- 7Z/RAR browsing and legacy `.doc/.ppt/.xls` binary formats are out of v1.0 scope; UI says so clearly.
- Office fidelity is "reading-grade", not pixel-exact.
- Installer is unsigned unless a certificate secret is configured.
- Touch and mixed-DPI multi-monitor cannot be automated on GitHub runners; manual checklist provided.

## 9. Native layer as implemented (checkpoint 3)
- **Crates.** `crates/core` (`pinboard-core`): model, SQLite, capture rules, ingestion, geometry — no OS dependency, tested on Linux. `src-tauri` (`mypinboard`): everything Windows. Only `platform.rs` and `clipboard.rs` contain `unsafe`.
- **Windows.** `handle` (16×72 dip transparent, non-activating, tool-window, always-on-top; the 10 dip tab is drawn by the page) and `board` (created on first open, hidden on close, destroyed after 90 s unused to release the WebView2 renderer). Dragging is done in Rust by following `GetCursorPos` while the left button is down, so it works across monitors and DPI without JS coordinates.
- **Placement** is stored as `{monitor device name, edge, offset 0.1–0.9}` and resolved against the live monitor list each time; an unplugged monitor falls back to the primary without overwriting the saved choice. Display/DPI changes (WM_DISPLAYCHANGE, WM_DPICHANGED via window subclass) re-home the windows, debounced 400 ms.
- **Material.** `window-vibrancy`: Mica (Windows 11) → Acrylic → none. With none, the page switches to opaque surfaces (`data-backdrop="none"`). DWM rounded corners (8 px) are requested; the native board uses an 8 px radius to match.
- **Clipboard.** `clipboard-win` `Monitor` (message-only window + AddClipboardFormatListener), thread blocked in GetMessage. Order: CF_HDROP > CF_UNICODETEXT > registered "PNG" > CF_BITMAP. Own writes are skipped by sequence number. Content flagged `ExcludeClipboardContentFromMonitorProcessing` / `CanIncludeInClipboardHistory=0` is never captured.
- **Data.** installed `%APPDATA%\MyPinboard\{mypinboard.db, images\, logs\}`, WebView2 profile `%LOCALAPPDATA%\MyPinboard\WebView2`; portable (`portable.flag`) everything under `.\data`. Images are files named by SHA-256 and referenced as `pbimg:<hash>.png`.
- **Safety.** The UI cannot touch the file system: it calls audited commands. Executables/scripts are never opened (only revealed); only http(s) links open; image deletion accepts exactly `pbimg:<64 hex>.png`.
- **CLI.** `MyPinboard.exe --print-stats <file>` dumps item counts/kinds/titles headlessly (used by CI to read the real database).
- **Not yet implemented:** drag-out of files, native backup with images, update check, installer options for desktop shortcut and auto-start, touch dragging of the handle.
