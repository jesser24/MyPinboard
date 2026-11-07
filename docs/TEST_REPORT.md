# Test report — checkpoint 3

Nothing below is claimed unless it was executed. "Not yet run" means exactly that.

## A. Executed in the Linux development sandbox
| Suite | What | Result |
|---|---|---|
| `cargo test -p pinboard-core` | SQLite persistence incl. reopen, crash simulation, corrupt-DB recovery; dedupe; eviction; capture rules; ingestion of text/URL/files/folders/groups/images; geometry for 9 display setups incl. mixed DPI | **32 / 32 passed** |
| `cargo test -p mypinboard --lib` | data-folder resolution (installed / portable / override), shortcut translation, executable blocklist | **5 / 5 passed** |
| `vitest` | layout matrix, edge geometry, capture, search, shortcuts, persistence, native adapter (pure parts) | **230 / 230 passed** |
| `tsc --noEmit`, `vite build` | types and production bundle | clean / OK |
| `scripts/e2e_browser.py` (Chromium 153, Linux) | UI behaviour in the browser preview, 9 resolutions × 2 themes | **99 / 99 passed** |
| `scripts/check-windows.sh` | `cargo check` of all Windows-only code **and** `tests/windows_native.rs` against the real Win32 bindings (windows-gnu target, std built from source) | **0 errors, 0 warnings** — *proves it compiles, not that it works* |

## B. Windows CI (`.github/workflows/ci.yml`, runner `windows-2022`) — NOT YET RUN
Will be filled from the real run (artifacts `windows-test-results`, step summary):
| Check | Result |
|---|---|
| `cargo test --workspace` incl. 8 real clipboard/monitor integration tests | not yet run |
| `tauri build` produces NSIS installer and x64 executable | not yet run |
| Portable exe is x64 (PE header) | not yet run |
| App starts; handle window visible, inside work area, on right edge, thin | not yet run |
| Board webview not running before first use | not yet run |
| Real clipboard capture of text, file, image while board is closed; no duplicate on re-copy | not yet run |
| Idle CPU over 10 s; memory of the process tree (idle and board open) | not yet run (numbers will be reported, not assumed) |
| Second launch forwards to the first instance; board opens on screen, no overlap with handle; Esc closes | not yet run |
| Data survives kill + restart; capture works after restart | not yet run |
| Silent install, launch, Start Menu shortcut, Apps & features entry, uninstall, user data preserved | not yet run |
| Real screenshots (`handle-only.png`, `board-open.png`) | not yet run; may be unavailable if the runner has no interactive desktop |

## C. Hardware-dependent — see MANUAL_TESTS.md
Mixed-DPI multi-monitor, touch, monitor hot-unplug, global hotkeys from other apps, tray interaction, Explorer drag-and-drop, Mica/Acrylic appearance, reboot persistence, auto-start after reboot: **not tested**.

## D. Known limitations at this checkpoint
Drag-out of files, native backup including images, update check, installer options (desktop shortcut, auto-start), touch dragging of the handle, Quick Review (not started), release ZIP assembly (not started).
