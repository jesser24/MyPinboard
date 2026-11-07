//! Edge handle / board geometry in *physical* pixels with per-monitor DPI. Pure functions, mirrors src/lib/edge.ts + layout.ts.
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Edge { Top, Bottom, Left, Right }

/// A monitor's **work area** (taskbar excluded) in physical pixels on the virtual desktop.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct MonitorInfo { pub id: String, pub x: i32, pub y: i32, pub w: i32, pub h: i32, pub scale: f64, pub primary: bool }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Placement { pub monitor: String, pub edge: Edge, pub offset: f64 }

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct PRect { pub x: i32, pub y: i32, pub w: i32, pub h: i32 }

pub const HANDLE_VISIBLE: f64 = 10.0;      // logical px of the tab that is drawn
pub const HANDLE_THICKNESS: f64 = 16.0;    // logical px of the (transparent) handle window, perpendicular to the edge
pub const HANDLE_LENGTH: f64 = 72.0;       // logical px along the edge
pub const OFFSET_MIN: f64 = 0.1;
pub const OFFSET_MAX: f64 = 0.9;
pub const BOARD_MARGIN: f64 = 12.0;
pub const MIN_BOARD: (f64, f64) = (340.0, 360.0);
pub const MAX_BOARD: (f64, f64) = (1280.0, 900.0);

fn clamp(v: f64, lo: f64, hi: f64) -> f64 { v.max(lo).min(hi) }
pub fn clamp_offset(o: f64) -> f64 { if o.is_finite() { clamp(o, OFFSET_MIN, OFFSET_MAX) } else { 0.5 } }

pub fn nearest_edge(px: i32, py: i32, m: &MonitorInfo) -> Edge {
    let d = [(Edge::Left, px - m.x), (Edge::Right, m.x + m.w - px), (Edge::Top, py - m.y), (Edge::Bottom, m.y + m.h - py)];
    d.iter().fold(d[0], |best, cur| if cur.1 < best.1 { *cur } else { best }).0
}

pub fn offset_for(edge: Edge, px: i32, py: i32, m: &MonitorInfo) -> f64 {
    match edge {
        Edge::Left | Edge::Right => clamp_offset((py - m.y) as f64 / m.h.max(1) as f64),
        Edge::Top | Edge::Bottom => clamp_offset((px - m.x) as f64 / m.w.max(1) as f64),
    }
}

/// Monitor containing the point, else the closest one. `None` only if there are no monitors.
pub fn monitor_for_point(px: i32, py: i32, monitors: &[MonitorInfo]) -> Option<&MonitorInfo> {
    let dist = |m: &MonitorInfo| {
        let dx = (m.x - px).max(0).max(px - (m.x + m.w - 1)) as i64;
        let dy = (m.y - py).max(0).max(py - (m.y + m.h - 1)) as i64;
        dx * dx + dy * dy
    };
    monitors.iter().min_by_key(|m| dist(m))
}

pub fn handle_window_rect(p: &Placement, m: &MonitorInfo) -> PRect {
    let t = (HANDLE_THICKNESS * m.scale).round() as i32;
    let len = ((HANDLE_LENGTH * m.scale).round() as i32).min(m.h).min(m.w);
    let o = clamp_offset(p.offset);
    let along_x = (m.x as f64 + o * m.w as f64 - len as f64 / 2.0).round() as i32;
    let along_y = (m.y as f64 + o * m.h as f64 - len as f64 / 2.0).round() as i32;
    match p.edge {
        Edge::Left => PRect { x: m.x, y: along_y, w: t, h: len },
        Edge::Right => PRect { x: m.x + m.w - t, y: along_y, w: t, h: len },
        Edge::Top => PRect { x: along_x, y: m.y, w: len, h: t },
        Edge::Bottom => PRect { x: along_x, y: m.y + m.h - t, w: len, h: t },
    }
}

/// Board size in logical px for a logical work area; mirrors `boardSize` in layout.ts.
pub fn board_size_logical(aw: f64, ah: f64, edge: Edge) -> (f64, f64) {
    let vertical = matches!(edge, Edge::Left | Edge::Right);
    let (w, h) = if vertical { (aw * 0.30, ah * 0.86) } else { (aw * 0.62, ah * 0.46) };
    let w = clamp(w, MIN_BOARD.0, MAX_BOARD.0);
    let h = clamp(h, MIN_BOARD.1, MAX_BOARD.1);
    (w.min((aw * 0.92).floor()), h.min((ah * 0.92).floor()))
}

pub fn board_rect(p: &Placement, m: &MonitorInfo) -> PRect {
    let aw = m.w as f64 / m.scale;
    let ah = m.h as f64 / m.scale;
    let (sw, sh) = board_size_logical(aw, ah, p.edge);
    let mg = BOARD_MARGIN;
    let w = sw.min(aw - 2.0 * mg);
    let h = sh.min(ah - 2.0 * mg);
    let o = clamp_offset(p.offset);
    let cx = clamp(o * aw - w / 2.0, mg, aw - w - mg);
    let cy = clamp(o * ah - h / 2.0, mg, ah - h - mg);
    let (x, y) = match p.edge {
        Edge::Left => (mg + HANDLE_VISIBLE, cy),
        Edge::Right => (aw - w - mg - HANDLE_VISIBLE, cy),
        Edge::Top => (cx, mg + HANDLE_VISIBLE),
        Edge::Bottom => (cx, ah - h - mg - HANDLE_VISIBLE),
    };
    PRect { x: m.x + (x * m.scale).round() as i32, y: m.y + (y * m.scale).round() as i32, w: (w * m.scale).round() as i32, h: (h * m.scale).round() as i32 }
}

/// Re-home a saved placement after monitors were added/removed or reconfigured. Never returns an off-screen placement.
pub fn resolve_placement(saved: &Placement, monitors: &[MonitorInfo]) -> Placement {
    let found = monitors.iter().find(|m| m.id == saved.monitor)
        .or_else(|| monitors.iter().find(|m| m.primary)).or_else(|| monitors.first());
    match found {
        Some(m) => Placement { monitor: m.id.clone(), edge: saved.edge, offset: clamp_offset(saved.offset) },
        None => saved.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(id: &str, x: i32, y: i32, w: i32, h: i32, scale: f64, primary: bool) -> MonitorInfo { MonitorInfo { id: id.into(), x, y, w, h, scale, primary } }
    /// Work areas in physical px, as Windows reports them (taskbar already subtracted).
    fn setups() -> Vec<(&'static str, Vec<MonitorInfo>)> {
        vec![
            ("1280x720@100", vec![mon("A", 0, 0, 1280, 680, 1.0, true)]),
            ("1366x768@100", vec![mon("A", 0, 0, 1366, 728, 1.0, true)]),
            ("1920x1080@125", vec![mon("A", 0, 0, 1920, 1040, 1.25, true)]),
            ("2560x1440@100", vec![mon("A", 0, 0, 2560, 1400, 1.0, true)]),
            ("3840x2160@250", vec![mon("A", 0, 0, 3840, 2120, 2.5, true)]),
            ("ultrawide 3440x1440@100", vec![mon("A", 0, 0, 3440, 1400, 1.0, true)]),
            ("portrait 1080x1920@100", vec![mon("A", 0, 0, 1080, 1880, 1.0, true)]),
            ("mixed DPI 1920@100 + 2560@150, secondary left of primary", vec![mon("P", 0, 0, 2560, 1400, 1.5, true), mon("S", -1920, 100, 1920, 1040, 1.0, false)]),
            ("mixed DPI stacked vertically", vec![mon("P", 0, 0, 1920, 1040, 1.0, true), mon("S", 0, -2160, 3840, 2120, 2.5, false)]),
        ]
    }
    fn inside(r: &PRect, m: &MonitorInfo) -> bool { r.x >= m.x && r.y >= m.y && r.x + r.w <= m.x + m.w && r.y + r.h <= m.y + m.h }
    fn overlap(a: &PRect, b: &PRect) -> bool { a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y }

    #[test] fn handle_and_board_always_on_their_monitor_and_never_overlap() {
        for (name, mons) in setups() { for m in &mons { for edge in [Edge::Top, Edge::Bottom, Edge::Left, Edge::Right] { for o in [0.0, 0.1, 0.5, 0.9, 1.0, 7.0, f64::NAN] {
            let p = Placement { monitor: m.id.clone(), edge, offset: o };
            let h = handle_window_rect(&p, m); let b = board_rect(&p, m);
            assert!(inside(&h, m), "{name} handle {edge:?} {o}: {h:?} not in {m:?}");
            assert!(inside(&b, m), "{name} board {edge:?} {o}: {b:?} not in {m:?}");
            assert!(!overlap(&h, &b), "{name} {edge:?} {o}: board overlaps handle");
            assert!(b.w > 0 && b.h > 0);
        }}}}
    }
    #[test] fn handle_is_flush_with_its_edge_and_thin() {
        let m = mon("A", 100, 50, 1920, 1040, 1.25, true);
        let h = handle_window_rect(&Placement { monitor: "A".into(), edge: Edge::Right, offset: 0.5 }, &m);
        assert_eq!(h.x + h.w, m.x + m.w); assert_eq!(h.w, 20); assert_eq!(h.h, 90);
        let h = handle_window_rect(&Placement { monitor: "A".into(), edge: Edge::Top, offset: 0.5 }, &m);
        assert_eq!(h.y, m.y); assert_eq!(h.h, 20);
    }
    #[test] fn nearest_edge_and_offset() {
        let m = mon("A", 0, 0, 1000, 600, 1.0, true);
        assert_eq!(nearest_edge(10, 300, &m), Edge::Left); assert_eq!(nearest_edge(990, 300, &m), Edge::Right);
        assert_eq!(nearest_edge(500, 5, &m), Edge::Top);   assert_eq!(nearest_edge(500, 595, &m), Edge::Bottom);
        assert_eq!(offset_for(Edge::Left, 0, 0, &m), OFFSET_MIN); assert_eq!(offset_for(Edge::Top, 1000, 0, &m), OFFSET_MAX);
    }
    #[test] fn dragging_across_monitors_picks_the_monitor_under_the_cursor() {
        let mons = setups().remove(7).1; // P at 0.. , S at -1920..
        assert_eq!(monitor_for_point(100, 100, &mons).unwrap().id, "P");
        assert_eq!(monitor_for_point(-500, 300, &mons).unwrap().id, "S");
        assert_eq!(monitor_for_point(-5000, 300, &mons).unwrap().id, "S", "outside any monitor -> closest");
        assert!(monitor_for_point(0, 0, &[]).is_none());
    }
    #[test] fn monitor_unplugged_rehomes_to_primary_and_clamps() {
        let one = vec![mon("P", 0, 0, 1920, 1040, 1.0, true)];
        let saved = Placement { monitor: "GONE".into(), edge: Edge::Left, offset: 0.97 };
        let r = resolve_placement(&saved, &one);
        assert_eq!(r.monitor, "P"); assert_eq!(r.edge, Edge::Left); assert_eq!(r.offset, OFFSET_MAX);
        let h = handle_window_rect(&r, &one[0]); assert!(inside(&h, &one[0]));
        assert_eq!(resolve_placement(&saved, &[]).monitor, "GONE", "no monitors: untouched");
    }
    #[test] fn board_size_matches_typescript_rules() {
        assert_eq!(board_size_logical(1920.0, 1080.0, Edge::Right), (576.0, 900.0));
        assert_eq!(board_size_logical(1920.0, 1080.0, Edge::Top), (1190.4, 496.8));
        assert_eq!(board_size_logical(2560.0, 1440.0, Edge::Left), (768.0, 900.0));
        let (w, h) = board_size_logical(300.0, 300.0, Edge::Left); assert!(w <= 276.0 && h <= 276.0);
    }
    #[test] fn mixed_dpi_board_logical_size_is_consistent() {
        let m = mon("S", 0, 0, 3840, 2120, 2.5, true);
        let b = board_rect(&Placement { monitor: "S".into(), edge: Edge::Right, offset: 0.5 }, &m);
        assert_eq!(b.w, (460.8f64 * 2.5).round() as i32); // 1536 logical * 0.30
    }
}
