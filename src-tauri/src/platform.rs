//! Thin, audited wrappers over the Win32 calls MyPinboard needs. Every `unsafe` block lives in this file or clipboard.rs.
//! Non-Windows builds get inert stubs so the crate (and its pure tests) build on any OS.
use pinboard_core::geometry::MonitorInfo;

#[cfg(windows)]
mod imp {
    use super::MonitorInfo;
    use std::ffi::c_void;
    use std::sync::OnceLock;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, LRESULT, POINT, RECT, TRUE, WPARAM};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW};
    use windows::Win32::System::DataExchange::GetClipboardOwner;
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, SetFocus, VK_LBUTTON};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{BringWindowToTop, GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, SetForegroundWindow, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_NOACTIVATE, SWP_NOZORDER, WM_DISPLAYCHANGE, WM_DPICHANGED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW};

    pub fn hwnd_of(w: &tauri::WebviewWindow) -> Option<HWND> { w.hwnd().ok().map(|h| HWND(h.0 as _)) }

    /// All monitors with their **work area** (taskbar excluded) in physical px and their effective DPI scale.
    pub fn monitors() -> Vec<MonitorInfo> {
        unsafe extern "system" fn cb(hmon: HMONITOR, _hdc: HDC, _r: *mut RECT, lparam: LPARAM) -> BOOL {
            let out = &mut *(lparam.0 as *mut Vec<MonitorInfo>);
            let mut info: MONITORINFOEXW = std::mem::zeroed();
            info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(hmon, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO).as_bool() {
                let (mut dx, mut dy) = (96u32, 96u32);
                let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
                let len = info.szDevice.iter().position(|&c| c == 0).unwrap_or(info.szDevice.len());
                let r = info.monitorInfo.rcWork;
                out.push(MonitorInfo { id: String::from_utf16_lossy(&info.szDevice[..len]), x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top,
                    scale: (dx.max(96) as f64) / 96.0, primary: info.monitorInfo.dwFlags & 1 != 0 });
            }
            TRUE
        }
        let mut v: Vec<MonitorInfo> = Vec::new();
        unsafe { let _ = EnumDisplayMonitors(HDC::default(), None, Some(cb), LPARAM(&mut v as *mut Vec<MonitorInfo> as isize)); }
        v.retain(|m| m.w > 0 && m.h > 0);
        v
    }

    pub fn cursor_pos() -> Option<(i32, i32)> { let mut p = POINT::default(); unsafe { GetCursorPos(&mut p).ok()?; } Some((p.x, p.y)) }
    pub fn left_button_down() -> bool { unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16) & 0x8000 != 0 } }

    /// File name of the process that owns the clipboard right now (e.g. `chrome.exe`). Used for the excluded-apps list.
    pub fn clipboard_owner_app() -> Option<String> {
        unsafe {
            let hwnd = GetClipboardOwner().ok()?;
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 { return None; }
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 520]; let mut len = buf.len() as u32;
            let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(h);
            r.ok()?;
            let full = String::from_utf16_lossy(&buf[..len as usize]);
            full.rsplit(['\\', '/']).next().map(str::to_string)
        }
    }

    /// Ask DWM for Windows 11 rounded corners (silently ignored on Windows 10).
    pub fn round_corners(w: &tauri::WebviewWindow) {
        if let Some(h) = hwnd_of(w) { let pref: i32 = 2; /* DWMWCP_ROUND */ unsafe { let _ = DwmSetWindowAttribute(h, DWMWINDOWATTRIBUTE(33), &pref as *const i32 as *const c_void, 4); } }
    }
    /// Handle must never steal keyboard focus from the app the user is working in, nor appear in Alt+Tab.
    pub fn make_non_activating(w: &tauri::WebviewWindow) {
        if let Some(h) = hwnd_of(w) { unsafe { let ex = GetWindowLongPtrW(h, GWL_EXSTYLE); SetWindowLongPtrW(h, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize); } }
    }

    /// Make the **visible** frame of `w` (what DWM draws, DWMWA_EXTENDED_FRAME_BOUNDS) exactly the physical rectangle `x,y,cw,ch`.
    /// Undecorated windows with a shadow carry invisible resize borders (~7 px per side): tao adds them to the requested size, so the real
    /// window ends up wider than asked and its visible frame is shifted towards the screen edge, over the handle. The offset between the window
    /// rectangle and the visible frame is measured on the real window and compensated with a synchronous `SetWindowPos`
    /// (it does not depend on the window size, so one correction is enough). Returns `false` if the frame could not be measured/fitted.
    pub fn fit_visible_rect(w: &tauri::WebviewWindow, x: i32, y: i32, cw: i32, ch: i32) -> bool {
        let Some(h) = hwnd_of(w) else { return false };
        for attempt in 0..4 {
            unsafe {
                let (mut outer, mut vis) = (RECT::default(), RECT::default());
                if GetWindowRect(h, &mut outer).is_err() { return false; }
                if DwmGetWindowAttribute(h, DWMWINDOWATTRIBUTE(9) /* DWMWA_EXTENDED_FRAME_BOUNDS */, &mut vis as *mut RECT as *mut c_void, std::mem::size_of::<RECT>() as u32).is_err() { return false; }
                if vis.left == x && vis.top == y && vis.right - vis.left == cw && vis.bottom - vis.top == ch { return true; }
                if attempt == 3 { return false; }
                // Per-edge distance between the window rectangle and its visible frame.
                let (dl, dt, dr, db) = (vis.left - outer.left, vis.top - outer.top, vis.right - outer.right, vis.bottom - outer.bottom);
                if [dl, dt, dr, db].iter().any(|v| v.abs() > 64) { return false; } // implausible (window not realised yet): leave it alone
                let (left, top, right, bottom) = (x - dl, y - dt, x + cw - dr, y + ch - db);
                let _ = SetWindowPos(h, HWND::default(), left, top, right - left, bottom - top, SWP_NOZORDER | SWP_NOACTIVATE);
            }
        }
        false
    }

    /// Give `w` the real keyboard focus. Windows refuses `SetForegroundWindow` from a process that is not in the foreground (typical when the board is
    /// opened by a second launch or a hotkey), so the calling thread is briefly attached to the foreground thread's input queue.
    pub fn focus_window(w: &tauri::WebviewWindow) {
        let Some(h) = hwnd_of(w) else { return };
        unsafe {
            let fg = GetForegroundWindow();
            if fg == h { return; }
            let me = GetCurrentThreadId();
            let fg_thread = if fg.0.is_null() { 0 } else { GetWindowThreadProcessId(fg, None) };
            let attached = fg_thread != 0 && fg_thread != me && AttachThreadInput(me, fg_thread, TRUE).as_bool();
            let _ = BringWindowToTop(h);
            let _ = SetForegroundWindow(h);
            let _ = SetFocus(h); // wry forwards WM_SETFOCUS to the WebView2 control, so the page receives key events
            if attached { let _ = AttachThreadInput(me, fg_thread, BOOL(0)); }
        }
    }

    static DISPLAY_CB: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();
    unsafe extern "system" fn subclass(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM, _id: usize, _data: usize) -> LRESULT {
        if msg == WM_DISPLAYCHANGE || msg == WM_DPICHANGED { if let Some(cb) = DISPLAY_CB.get() { cb(); } }
        DefSubclassProc(hwnd, msg, wp, lp)
    }
    /// Calls `cb` whenever monitors are added/removed or resolution/DPI changes (event-driven, no polling).
    pub fn watch_display_changes(w: &tauri::WebviewWindow, cb: Box<dyn Fn() + Send + Sync>) {
        if DISPLAY_CB.set(cb).is_err() { return; }
        if let Some(h) = hwnd_of(w) { unsafe { let _ = SetWindowSubclass(h, Some(subclass), 0x4D50, 0); } }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::MonitorInfo;
    pub fn monitors() -> Vec<MonitorInfo> { vec![MonitorInfo { id: "stub".into(), x: 0, y: 0, w: 1920, h: 1040, scale: 1.0, primary: true }] }
    pub fn cursor_pos() -> Option<(i32, i32)> { None }
    pub fn left_button_down() -> bool { false }
    pub fn clipboard_owner_app() -> Option<String> { None }
    pub fn round_corners(_: &tauri::WebviewWindow) {}
    pub fn make_non_activating(_: &tauri::WebviewWindow) {}
    pub fn fit_visible_rect(_: &tauri::WebviewWindow, _: i32, _: i32, _: i32, _: i32) -> bool { false }
    pub fn focus_window(_: &tauri::WebviewWindow) {}
    pub fn watch_display_changes(_: &tauri::WebviewWindow, _: Box<dyn Fn() + Send + Sync>) {}
}
pub use imp::*;
