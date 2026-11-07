"""Browser-level end-to-end test of the React UI (Chromium on Linux). NOT a Windows test: native features are covered by the Windows CI."""
import sys, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "shots"
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail)); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

PASTE = """(payload) => { const dt = new DataTransfer();
  if (payload.text !== undefined) dt.setData('text/plain', payload.text);
  if (payload.file) dt.items.add(new File([payload.file.body], payload.file.name, {type: payload.file.type}));
  const e = new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}); document.body.dispatchEvent(e); }"""
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

def seed(page):
    for t in ["Meeting notes: ship the glass UI on Friday", "https://react.dev/learn", "const total = items.reduce((a, b) => a + b, 0);",
              "Rappeler le client à 15h — devis n°2024-118", "https://v2.tauri.app/"]:
        page.evaluate(PASTE, {"text": t})
    for n, ty, body in [("Quarterly report.pdf", "application/pdf", "x" * 2048000), ("budget.xlsx", "application/vnd.ms-excel", "x" * 54000), ("archive.zip", "application/zip", "x" * 9000000), ("notes.md", "text/markdown", "# hi")]:
        page.evaluate(PASTE, {"file": {"name": n, "type": ty, "body": body}})
    page.evaluate("""() => { const c=document.createElement('canvas'); c.width=320;c.height=200; const g=c.getContext('2d'); const gr=g.createLinearGradient(0,0,320,200); gr.addColorStop(0,'#8b6cf7'); gr.addColorStop(1,'#38bdf8'); g.fillStyle=gr; g.fillRect(0,0,320,200);
      c.toBlob(b=>{ const dt=new DataTransfer(); dt.items.add(new File([b],'mockup.png',{type:'image/png'})); document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }); }""")
    page.wait_for_timeout(300)

def rect(page, sel):
    return page.evaluate("(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}}", sel)
def inside(r, vw, vh): return r and r["x"] >= -0.5 and r["y"] >= -0.5 and r["x"] + r["w"] <= vw + 0.5 and r["y"] + r["h"] <= vh + 0.5

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 720}, color_scheme="dark", permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e))); page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_selector(".handle")

    # --- edge handle ---
    h = rect(page, ".handle"); check("handle visible at right edge on load", h and abs(h["x"] + h["w"] - 1280) < 1 and h["w"] == 10, h)
    check("handle is never fully off-screen", inside(h, 1280, 720))
    check("board hidden initially", page.query_selector(".board") is None)

    # --- open animation ---
    page.click(".handle"); page.wait_for_selector('.board[data-state="open"]')
    check("click handle opens board", page.query_selector(".board") is not None)
    page.keyboard.press("Escape"); page.wait_for_timeout(450)
    check("Escape closes board (reverse animation then unmount)", page.query_selector(".board") is None)
    page.click(".handle"); page.wait_for_selector('.board[data-state="open"]'); page.mouse.click(300, 300); page.wait_for_timeout(450)
    check("outside click closes board", page.query_selector(".board") is None)
    # animation actually animates: sample opacity right after opening
    page.evaluate("document.documentElement.style.setProperty('--dur','900ms')")
    page.evaluate("""()=>{ window.__op=[]; const t0=performance.now(); const tick=()=>{ const el=document.querySelector('.board'); if(el) window.__op.push(parseFloat(getComputedStyle(el).opacity)); if(performance.now()-t0<2000) requestAnimationFrame(tick)}; document.querySelector('.handle').addEventListener('pointerup',()=>requestAnimationFrame(tick),{once:true}); }""")
    page.click(".handle"); page.wait_for_timeout(2200)
    ops = page.evaluate("window.__op"); mono = all(b >= a - 1e-9 for a, b in zip(ops, ops[1:]))
    check("opening animates opacity smoothly (intermediate values, monotonic, ends at 1)", any(0 < o < 1 for o in ops) and ops[-1] == 1 and mono, f"{len(ops)} frames, sample={ops[:3]}..{ops[-2:]}")
    page.evaluate("document.documentElement.style.setProperty('--dur','280ms')")

    # --- capture via paste / drop-like ingestion ---
    page.keyboard.press("Escape"); page.wait_for_timeout(500); page.click(".handle"); page.wait_for_selector('.board[data-state="open"]')
    seed(page)
    n = page.locator(".card").count(); check("paste captured text, URLs, files and image as cards", n == 10, n)
    page.evaluate(PASTE, {"text": "https://react.dev/learn"}); page.wait_for_timeout(100)
    check("duplicate paste does not add a card", page.locator(".card").count() == 10)
    check("URL classified as link", page.locator('.card[data-kind="url"]').count() == 2)
    check("image card has a thumbnail", page.locator('.card[data-kind="image"] img').count() == 1)

    # --- search / filters ---
    page.fill(".search input", "tauri"); check("search filters instantly", page.locator(".card").count() == 1)
    page.fill(".search input", "client devis"); check("multi-token, accent-insensitive search", page.locator(".card").count() == 1)
    page.fill(".search input", ""); page.click('.chip:has-text("Images")'); check("kind filter works", page.locator(".card").count() == 1); page.click('.chip:has-text("All")')

    # --- context menu actions ---
    card = page.locator('.card:has-text("Quarterly report.pdf")'); card.click(button="right"); page.click('.menu >> text=Pin')
    check("pin via context menu floats card first", page.locator(".card").first.get_attribute("aria-label").endswith("Quarterly report.pdf"))
    card.click(button="right"); page.click('.menu >> text=Favourite'); check("favourite flag shown", page.locator(".card .fav").count() == 1)
    card.click(button="right"); page.click('.menu >> text=Rename label'); page.fill(".modal input", "Q3 Report"); page.click('.modal button:has-text("Save")')
    check("rename label", page.locator('.card:has-text("Q3 Report")').count() == 1)
    card = page.locator('.card:has-text("Q3 Report")'); card.click(button="right"); page.click('.menu >> text=Add tag'); page.fill(".modal input", "Finance"); page.keyboard.press("Enter")
    check("tag added and filterable", page.locator(".card .tag").count() == 1); page.locator(".card .tag").click(); check("tag filter", page.locator(".card").count() == 1); page.click('.chip:has-text("#finance")')
    page.locator('.card:has-text("budget.xlsx")').click(button="right"); page.click('.menu >> text=Move to collection'); page.click('.submenu >> text=Work')
    page.click('.tabs >> text=Work'); check("move to collection + collection filter", page.locator(".card").count() == 1); page.click('.tabs >> text=Work')
    page.locator('.card:has-text("notes.md")').click(button="right"); page.click('.menu >> text=Remove from board'); page.click('.modal button:has-text("Remove")')
    check("remove (with confirmation)", page.locator('.card:has-text("notes.md")').count() == 0)
    page.locator('.card:has-text("react.dev")').first.click(); page.wait_for_timeout(200)
    check("single click copies to clipboard", "react.dev" in page.evaluate("navigator.clipboard.readText()"))
    page.locator('.card[data-kind="text"]').first.dblclick(); check("double-click text opens editor", page.locator(".modal textarea").count() == 1); page.keyboard.press("Escape")

    # --- persistence ---
    page.reload(); page.wait_for_selector(".handle"); page.click(".handle"); page.wait_for_selector(".card")
    check("items persist across reload", page.locator(".card").count() == 9, page.locator(".card").count())
    check("pinned/favourite/rename persist", page.locator('.card:has-text("Q3 Report")').count() == 1 and page.locator(".card .fav").count() == 1)

    # --- settings ---
    page.click('[aria-label="Settings"]'); page.click('.seg >> text=Light'); check("light theme applies", page.evaluate("document.documentElement.dataset.theme") == "light")
    page.click('.seg >> text=Dark'); page.click('[aria-label="azure"]'); check("accent applies", page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent-a').trim()") == "#38bdf8")
    page.fill('input[aria-invalid]:near(:text("Search"))', "Win+Alt+S") if False else None
    inputs = page.locator('.settings .field input[aria-invalid]'); inputs.nth(1).fill("alt+win+s"); page.wait_for_timeout(100)
    check("shortcut conflict detected", page.locator(".warn-text").count() == 1); inputs.nth(1).fill("Win+Alt+P"); page.keyboard.press("Tab")
    check("conflict clears when fixed", page.locator(".warn-text").count() == 0)
    page.click('.settings .btn:has-text("Export backup")', no_wait_after=True) if False else None
    with page.expect_download() as d: page.click('text=Export backup')
    data = json.load(open(d.value.path())); check("backup export contains items+settings", data["app"] == "MyPinboard" and len(data["items"]) == 9 and "settings" in data)
    page.click('text=Clear history'); page.click('.modal button:has-text("Clear")'); page.click(".settings .back"); page.wait_for_timeout(150)
    check("clear history keeps pinned + favourite only", page.locator(".card").count() == 1, page.locator(".card").count())
    page.click('[aria-label="Settings"]'); d.value.save_as(OUT + "/_backup.json")
    page.set_input_files('input[type=file]', OUT + "/_backup.json"); page.wait_for_timeout(300); page.click(".settings .back")
    check("restore from backup brings items back", page.locator(".card").count() == 9, page.locator(".card").count())

    # --- moving the handle to every edge ---
    page.keyboard.press("Escape"); page.wait_for_timeout(500)
    for edge, (x, y) in {"bottom": (640, 715), "left": (3, 360), "top": (640, 3), "right": (1277, 360)}.items():
        hr = rect(page, ".handle"); page.mouse.move(hr["x"] + hr["w"] / 2, hr["y"] + hr["h"] / 2); page.mouse.down(); page.mouse.move(x, y, steps=8); page.mouse.up(); page.wait_for_timeout(150)
        hr = rect(page, ".handle"); stage = page.get_attribute(".stage", "data-edge")
        check(f"drag handle snaps to {edge} edge and stays visible", stage == edge and inside(hr, 1280, 720), f"{stage} {hr}")
        page.click(".handle"); page.wait_for_selector('.board[data-state="open"]'); page.wait_for_timeout(500); br_ = rect(page, ".board"); hr = rect(page, ".handle")
        ov = hr["x"] < br_["x"] + br_["w"] and hr["x"] + hr["w"] > br_["x"] and hr["y"] < br_["y"] + br_["h"] and hr["y"] + hr["h"] > br_["y"]
        check(f"board on {edge}: fully on screen, no overlap with handle", inside(br_, 1280, 720) and not ov, br_)
        page.keyboard.press("Escape"); page.wait_for_timeout(450)
    # drag position persists
    hr = rect(page, ".handle"); page.mouse.move(hr["x"] + 5, hr["y"] + 36); page.mouse.down(); page.mouse.move(1277, 200, steps=6); page.mouse.up(); page.reload(); page.wait_for_selector(".handle"); h2 = rect(page, ".handle")
    check("handle position persists after restart", abs(h2["y"] + h2["h"] / 2 - 200) < 4 and h2["x"] > 1200, h2)
    # board move by grip
    page.click(".handle"); page.wait_for_selector('.board[data-state="open"]'); g = rect(page, ".grip")
    page.mouse.move(g["x"] + 10, g["y"] + 10); page.mouse.down(); page.mouse.move(40, 300, steps=8); page.mouse.up(); page.wait_for_timeout(500)
    check("dragging the board by its grip docks it to the nearest edge", page.get_attribute(".stage", "data-edge") == "left" and inside(rect(page, ".board"), 1280, 720))
    page.mouse.move(640, 360); check("moving board did not close it", page.query_selector(".board") is not None)
    page.keyboard.press("Control+f"); page.wait_for_timeout(100); check("Ctrl+F focuses search", page.evaluate("document.activeElement.getAttribute('aria-label')") == "Search")

    # --- responsive matrix + screenshots ---
    page.evaluate("localStorage.removeItem('mypinboard.v1')")  # fresh edge placement, keep content: re-seed
    matrix = [("1280x720", 1280, 720, 1), ("1366x768", 1366, 768, 1), ("1920x1080", 1920, 1080, 1), ("2560x1440", 2560, 1440, 1), ("3840x2160", 3840, 2160, 1),
              ("3840x2160@250pct", 1536, 864, 2.5), ("3440x1440-ultrawide", 3440, 1440, 1), ("1080x1920-portrait", 1080, 1920, 1), ("1920x1080@150pct", 1280, 720, 1.5)]
    for scheme in ("dark", "light"):
        for name, w, hgt, dpr in matrix:
            c2 = br.new_context(viewport={"width": w, "height": hgt}, device_scale_factor=dpr, color_scheme=scheme); pg = c2.new_page(); pg.goto(URL); pg.wait_for_selector(".handle")
            if scheme == "light": pg.evaluate("localStorage.setItem('mypinboard.v1', JSON.stringify({settings:{theme:'light'}}))"); pg.reload(); pg.wait_for_selector(".handle")
            else: pg.evaluate("localStorage.setItem('mypinboard.v1', JSON.stringify({settings:{theme:'dark'}}))"); pg.reload(); pg.wait_for_selector(".handle")
            pg.click(".handle"); pg.wait_for_selector('.board[data-state="open"]'); seed(pg); pg.wait_for_timeout(500)
            br_ = rect(pg, ".board"); hh = rect(pg, ".handle")
            # no clipped / overlapping content: every control inside the board, grid has no horizontal overflow
            ov = pg.evaluate("""()=>{const b=document.querySelector('.board').getBoundingClientRect(); const bad=[...document.querySelectorAll('.board .bar *, .board .tabs, .board .filters, .board .foot')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && (r.right>b.right+1||r.left<b.left-1)}); const g=document.querySelector('.grid'); return {badControls:bad.length, gridOverflowX:g.scrollWidth>g.clientWidth+1}}""")
            check(f"[{scheme}] {name}: board within screen", inside(br_, w, hgt), br_); check(f"[{scheme}] {name}: no clipped controls / no horizontal grid overflow", ov["badControls"] == 0 and not ov["gridOverflowX"], ov)
            sq = pg.evaluate("""()=>{ const bad=[]; document.querySelectorAll('.card').forEach(c=>{ const t=c.querySelector('.thumb').getBoundingClientRect(); const m=c.querySelector('.meta').getBoundingClientRect(); const cr=c.getBoundingClientRect();
                if (c.scrollHeight>c.clientHeight+1 || m.bottom>cr.bottom+1) bad.push('squashed:'+c.getAttribute('aria-label')); const g=c.querySelector('.glyph b'); if(g){const r=g.getBoundingClientRect(); if(r.bottom>t.bottom+0.5||r.top<t.top-0.5) bad.push('label clipped:'+g.textContent)}
                const sn=c.querySelector('.snippet'); if(sn && sn.scrollHeight>sn.clientHeight+1 && getComputedStyle(sn).webkitLineClamp==='none') bad.push('snippet clipped')}); return bad}""")
            check(f"[{scheme}] {name}: cards not squashed, extension labels not clipped", not sq, sq[:3])
            cols = pg.evaluate("getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length")
            if name in ("1280x720", "1920x1080", "2560x1440", "3840x2160") or scheme == "dark" and name in ("1080x1920-portrait", "3440x1440-ultrawide", "3840x2160@250pct"):
                pg.screenshot(path=f"{OUT}/{scheme}-{name}.png")
            print(f"     {scheme} {name}: board {int(br_['w'])}x{int(br_['h'])} cols={cols}")
            c2.close()
    check("no uncaught page errors or console errors", not errors, errors[:3])
    br.close()
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed"); sys.exit(1 if failed else 0)
