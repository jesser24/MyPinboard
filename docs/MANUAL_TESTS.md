# Manual test checklist (things GitHub's Windows runners cannot do)
Tick each item on real hardware and note Windows version, monitors and scaling. Results go in TEST_REPORT.md.

## Displays and DPI
- [ ] Single monitor at 100 %, 125 %, 150 %, 200 %, 250 %: handle visible on all four edges, board fully on screen, text sharp, no clipped controls.
- [ ] Two monitors with different scaling (e.g. 100 % + 150 %): drag the handle from one to the other; it lands on the edge of the monitor under the cursor; board opens on that monitor at the right size.
- [ ] Monitors stacked vertically and side by side, secondary left of primary (negative coordinates).
- [ ] Unplug the monitor holding the handle: within ~1 s the handle reappears on the primary; plug it back and restart: saved monitor is used again.
- [ ] Change resolution and scaling while running: handle and open board re-home correctly.
- [ ] Taskbar on top / left / right / auto-hide: handle and board stay inside the work area.
- [ ] Portrait and ultrawide monitors.

## Interaction
- [ ] Click handle opens board with slide/fade (~280 ms); Esc, outside click and clicking the handle close it.
- [ ] Drag a file from Explorer onto the handle: board opens, drop captures it; board does not close mid-drag.
- [ ] Drag the handle by touch (known limitation: tap works, drag does not).
- [ ] Win+Alt+S, Win+Alt+P, Win+Alt+C work from any app; change one in Settings and confirm; create a conflict and confirm the warning.
- [ ] Tray icon: left click toggles board, menu items work, tooltip reflects pause state.
- [ ] Context menu, rename, tag, move to collection, remove.

## Clipboard
- [ ] Copy text in Notepad, a browser, Word, VS Code: captured with the right source app.
- [ ] Copy a URL, an image from a browser, a screenshot (Win+Shift+S), several files and a folder in Explorer.
- [ ] Copy a password from a password manager that sets the "exclude" flag: not captured.
- [ ] Add an app to Excluded applications: its copies are ignored.
- [ ] Click a card to copy it back, paste elsewhere: no duplicate appears.
- [ ] Pause via tray and hotkey: nothing captured; manual capture still works.

## Persistence and system
- [ ] Reboot the PC: items, collections, settings and handle position are intact.
- [ ] Enable "Start with Windows", reboot: app is running in the tray, board closed, handle visible.
- [ ] Kill the process with Task Manager during use, restart: no data loss.
- [ ] Uninstall keeps `%APPDATA%\MyPinboard`.
- [ ] Windows transparency effects off / battery saver: board stays readable.
- [ ] Idle for 10 minutes with the board closed: note memory (Task Manager, process tree) and CPU.
