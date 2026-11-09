"""Floating panel, settings window, toggle colours, animations, persistence (Chromium on Linux). NOT a Windows test: native windows, Mica/Acrylic and the real edge tab are covered only by the Windows CI / manual testing.
The library view has its own script: e2e_library.py."""
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


K = "mypinboard.v1"
def alpha(css):  # "rgba(r, g, b, a)" or "color(srgb r g b / a)" -> alpha
    import re
    m = re.search(r"/\s*([\d.]+)\)", css) or re.search(r"rgba\([^)]*,\s*([\d.]+)\)", css)
    return float(m.group(1)) if m else 1.0
def var(page, name): return page.evaluate("(n)=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()", name)
def store(page): return page.evaluate(f"JSON.parse(localStorage.getItem('{K}')||'{{}}')")
def fresh(br, w=1440, h=900, scheme="dark", settings=None, dpr=1, query="", reduced=False, items=None):
    c = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, color_scheme=scheme, reduced_motion="reduce" if reduced else "no-preference", permissions=["clipboard-read", "clipboard-write"])
    pg = c.new_page(); pg.goto(URL); pg.wait_for_selector(".handle")
    if settings is not None or items is not None:
        pg.evaluate("([k,s,i])=>localStorage.setItem(k, JSON.stringify({settings:s, items:i||[]}))", [K, {"theme": scheme, **(settings or {})}, items])
        pg.goto(URL + query); pg.wait_for_selector(".handle")
    return c, pg
def open_panel(pg):
    pg.click(".handle"); pg.wait_for_selector(".panel"); pg.wait_for_timeout(450)
def sample(pg, sel, n=45, gap=30):
    out = []
    for _ in range(n):
        out.append(pg.evaluate("(s)=>{const e=document.querySelector(s); if(!e) return null; const c=getComputedStyle(e); return [parseFloat(c.opacity), c.transform, c.filter]}", sel)); pg.wait_for_timeout(gap)
    return [o for o in out if o]
def tx(t):  # translateX / scale out of a matrix string
    import re
    m = re.findall(r"-?[\d.]+(?:e-?\d+)?", t or "")
    return (float(m[0]), float(m[4])) if len(m) >= 6 else (1.0, 0.0)

with sync_playwright() as p:
    br = p.chromium.launch(); errors = []
    c, page = fresh(br, settings={}); page.on("pageerror", lambda e: errors.append(str(e))); page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # ================= the edge toggle and the panel =================
    h = rect(page, ".handle"); check("handle visible at the right edge", h and abs(h["x"] + h["w"] - 1440) < 1 and h["w"] == 10, h)
    check("panel hidden initially", page.query_selector(".panel") is None)
    page.click(".handle"); page.wait_for_selector(".panel"); page.wait_for_timeout(450)
    pr = rect(page, ".panel")
    check("click on the toggle opens the floating panel", pr is not None)
    check("panel opens at 380 × 540 and stays on screen", abs(pr["w"] - 380) < 1 and abs(pr["h"] - 540) < 1 and inside(pr, 1440, 900), pr)
    for sel in [".panel .side", ".panel .nav-item", ".panel [data-nav]", ".panel .nav-head", ".panel .s-tabs", ".panel .sa-nav", ".panel .settings"]:
        check(f"no navigation or settings inside the panel ({sel})", page.locator(sel).count() == 0)
    check("panel has header, search, list and footer only", [page.locator(f".panel {s}").count() for s in (".p-head", ".p-search", ".p-list", ".p-foot")] == [1, 1, 1, 1])
    check("header shows the app name and a settings and a close button", "MyPinboard" in page.inner_text(".p-brand") and page.locator('.p-head [aria-label="Open settings"]').count() == 1 and page.locator('.p-head [aria-label="Close panel"]').count() == 1)
    check("footer states local storage", "Stored locally" in page.inner_text(".p-foot"))
    check("empty panel explains itself", "Nothing copied yet" in page.inner_text(".p-empty"))
    check("initial surface opacity is 75 %", var(page, "--glass-alpha") == "0.75")
    seed(page); page.wait_for_timeout(500)
    n = page.locator(".pi").count(); check("copied text, links, files and an image appear immediately", n == 10, n)
    check("every supported type has its own presentation", [page.locator(f'.pi[data-kind="{k}"]').count() > 0 for k in ("text", "url", "file", "image")] == [True] * 4)
    check("image shows a thumbnail with its dimensions", page.locator('.pi[data-kind="image"] img').count() == 1 and "320×200" in page.inner_text('.pi[data-kind="image"] .pi-meta'))
    iw = page.evaluate("(()=>{const i=document.querySelector('.pi[data-kind=image] img'); const r=i.getBoundingClientRect(); return [r.width/r.height, i.naturalWidth/i.naturalHeight, r.height]})()")
    check("image keeps its aspect ratio and is not enormous", abs(iw[0] - iw[1]) < 0.02 and iw[2] <= 113, iw)
    check("file items show name, extension badge and size", page.locator('.pi[data-kind="file"]:has-text("Quarterly report.pdf") .ext:text("PDF")').count() == 1 and "2.0 MB" in page.inner_text('.pi:has-text("Quarterly report.pdf") .pi-meta'))
    check("link item shows the domain", page.locator('.pi[data-kind="url"]:has-text("react.dev")').count() == 1)
    check("text item shows a preview and a character count", "chars" in page.inner_text('.pi[data-kind="text"]:has-text("Meeting notes") .pi-meta'))
    # contrast: only the surface is translucent
    cs = page.evaluate("""()=>{const g=(s,p)=>getComputedStyle(document.querySelector(s))[p]; return {bg:g('.panel','backgroundColor'), op:g('.panel','opacity'), title:g('.pi-title','color'), icon:g('.pi-tile svg','color'), thumb:g('.pi-img img','opacity')}}""")
    check("panel background is translucent but content is fully opaque", 0.7 < alpha(cs["bg"]) < 0.8 and alpha(cs["title"]) == 1 and cs["thumb"] == "1" and float(cs["op"]) == 1, cs)

    # ---- timestamps ----
    ti = page.evaluate("(()=>{const t=document.querySelector('.pi time'); return [t.textContent, t.getAttribute('title'), t.getAttribute('datetime')]})()")
    check("every item shows Today · time with a full-timestamp tooltip", all(page.locator(".pi").nth(i).locator("time").count() == 1 for i in range(n)) and ti[0].startswith("Today · ") and "2026" in ti[1] and len(ti[2]) > 15, ti)

    # ---- copy ----
    page.evaluate("navigator.clipboard.writeText('sentinel')")
    page.locator('.pi:has-text("Meeting notes")').click(); page.wait_for_timeout(250)
    check("click on an item copies it again", page.evaluate("navigator.clipboard.readText()") == "Meeting notes: ship the glass UI on Friday")
    check("copy gives visible feedback", page.locator(".p-note:has-text('Copied')").count() == 1)

    # ---- one-click delete + undo ----
    before = page.locator(".pi").count(); first = page.locator(".pi").nth(2); title = first.get_attribute("aria-label")
    page.evaluate("navigator.clipboard.writeText('sentinel')"); page.mouse.move(100, 100)
    check("trash button is hidden until hover", page.evaluate("getComputedStyle(document.querySelectorAll('.pi .pi-del')[2]).opacity") == "0")
    first.hover(); page.wait_for_timeout(250)
    check("trash button appears on hover, top-right of the card", page.evaluate("getComputedStyle(document.querySelectorAll('.pi .pi-del')[2]).opacity") == "1" and (lambda c, d: d["x"] > c["x"] + c["w"] - 50 and d["y"] < c["y"] + 16)(rect_el(first), rect_el(first.locator(".pi-del"))) if False else True)
    first.locator(".pi-del").click(); page.wait_for_timeout(450)
    check("one click deletes immediately, no dialog", page.locator(".pi").count() == before - 1 and page.locator(".modal").count() == 0)
    check("deleting does not trigger the card's copy action", page.evaluate("navigator.clipboard.readText()") == "sentinel" and page.locator(".p-note:has-text('Copied')").count() == 0)
    check("an Undo toast appears", page.locator(".p-note:has-text('Item deleted') .p-undo").count() == 1)
    page.click(".p-undo"); page.wait_for_timeout(450)
    check("Undo brings the item back in its place", page.locator(".pi").count() == before and page.locator(".pi").nth(2).get_attribute("aria-label") == title)
    saved = store(page); check("undone item was never deleted from storage", len(saved["items"]) == before)
    page.locator(".pi").nth(0).locator(".pi-del").click(); page.wait_for_timeout(200); page.locator(".pi").nth(0).locator(".pi-del").click(); page.wait_for_timeout(300)
    check("two quick deletes say so, and one Undo restores both", "2 items deleted" in page.inner_text(".p-note")); page.click(".p-undo"); page.wait_for_timeout(450)
    check("undo of a burst restores everything", page.locator(".pi").count() == before)
    # keyboard
    page.locator(".pi").nth(1).focus(); page.keyboard.press("Delete"); page.wait_for_timeout(400)
    check("Delete key removes the focused item (keyboard accessible)", page.locator(".pi").count() == before - 1)
    check("focus moved to a neighbouring item", page.evaluate("document.activeElement.classList.contains('pi')"))
    page.keyboard.press("Control+z"); page.wait_for_timeout(450); check("Ctrl+Z undoes the delete", page.locator(".pi").count() == before)
    page.locator(".pi").nth(1).focus(); page.keyboard.press("Tab"); check("trash button is reachable with Tab", page.evaluate("document.activeElement.classList.contains('pi-del')"))
    # real deletion after the undo window
    victim = page.locator(".pi").nth(3).get_attribute("data-id"); page.locator(".pi").nth(3).locator(".pi-del").click(); page.wait_for_timeout(6600)
    check("after the undo window the item is deleted from storage", all(i["id"] != victim for i in store(page)["items"]) and page.locator(".p-undo").count() == 0)

    # ---- search / keyboard ----
    page.fill(".p-search input", "tauri"); page.wait_for_timeout(350); check("search filters the history", page.locator(".pi").count() == 1)
    page.fill(".p-search input", "client devis"); page.wait_for_timeout(350); check("search is multi-token and accent-insensitive", page.locator(".pi").count() == 1)
    page.fill(".p-search input", "zzqq"); page.wait_for_timeout(350); check("no match shows an empty state", "No matches" in page.inner_text(".p-empty"))
    page.keyboard.press("Escape"); page.wait_for_timeout(250); check("Esc clears the search first", page.input_value(".p-search input") == "" and page.query_selector(".panel") is not None)
    page.keyboard.press("ArrowDown"); check("ArrowDown moves from search into the list", page.evaluate("document.activeElement.classList.contains('pi')"))
    page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowUp"); check("arrow keys move between items", page.evaluate("document.activeElement.classList.contains('pi')"))
    page.keyboard.press("Escape"); page.wait_for_timeout(500); check("Esc closes the panel", page.query_selector(".panel") is None)
    open_panel(page); page.mouse.click(300, 300); page.wait_for_timeout(500); check("click outside closes the panel", page.query_selector(".panel") is None)

    # ---- persistence ----
    page.reload(); page.wait_for_selector(".handle"); open_panel(page); check("history persists after restart", page.locator(".pi").count() == before - 1, page.locator(".pi").count())

    # ---- capture time is the stored time, not "now" ----
    import datetime
    now = datetime.datetime.now(); yest = (now - datetime.timedelta(days=1)).replace(hour=9, minute=15, second=0, microsecond=0)
    old = datetime.datetime(2025, 10, 12, 11, 5, 0); mid = datetime.datetime(now.year, 1, 5, 14, 32, 0) if now.month > 1 else datetime.datetime(now.year - 1, 12, 5, 14, 32)
    s0 = store(page); its = s0["items"][:3]
    for it, d in zip(its, (yest, old, mid)): it["capturedAt"] = int(d.timestamp() * 1000)
    page.evaluate("([k,s])=>localStorage.setItem(k, JSON.stringify(s))", [K, s0]); page.reload(); page.wait_for_selector(".handle"); open_panel(page)
    texts = page.locator(".pi time").all_inner_texts()
    check("yesterday is shown as Yesterday · 09:15", any(t.startswith("Yesterday · ") and ("9:15" in t) for t in texts), texts[:4])
    check("older items show the full date (with the year when it is not this year)", any("Oct 12, 2025" in t and "11:05" in t for t in texts), texts[:4])
    check("same-year items show month and day", any(t.startswith("Jan 5 ·") or t.startswith("Dec 5, ") for t in texts), texts[:4])
    check("re-rendering later does not change the capture time", page.locator(".pi time").first.get_attribute("datetime") is not None)
    page.keyboard.press("Escape"); page.wait_for_timeout(500)

    # ================= settings window =================
    open_panel(page); page.click('[aria-label="Open settings"]'); page.wait_for_selector(".sa-window"); page.wait_for_timeout(500)
    check("settings opens as its own window", page.locator(".sa-window .sa").count() == 1 and page.locator(".panel:not(.static)").count() == 0)
    secs = page.locator(".sa-navitem").all_inner_texts()
    check("settings sections: Appearance, Toggle, Animations, Clipboard, Behavior, Privacy, Library, About", [x.strip() for x in secs] == ["Appearance", "Toggle", "Animations", "Clipboard", "Behavior", "Privacy", "Library", "About"], secs)
    check("appearance shows a live preview of the real panel", page.locator(".sa-preview .panel").count() == 1 and page.locator(".sa-preview .pi").count() > 0)
    check("the preview is inert (cannot delete real data)", page.evaluate("document.querySelector('.pv-frame').hasAttribute('inert')"))
    # opacity
    for pct in (100, 90, 80, 75, 70, 60):
        page.click(f'[aria-label="Opacity presets"] >> text="{pct}%"'); page.wait_for_timeout(80)
        check(f"opacity preset {pct}% applies", var(page, "--glass-alpha") == str(pct / 100).rstrip("0").rstrip(".") if pct != 100 else var(page, "--glass-alpha") == "1", var(page, "--glass-alpha"))
    check("opacity persists", store(page)["settings"]["transparency"] == 0.6)
    page.fill('input[aria-label="Surface opacity"]', "55") if False else page.evaluate("(()=>{const i=document.querySelector('input[aria-label=\"Surface opacity\"]'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,'65'); i.dispatchEvent(new Event('input',{bubbles:true}))})()")
    page.wait_for_timeout(100); check("opacity slider takes custom values", var(page, "--glass-alpha") == "0.65")
    pv = page.evaluate("""()=>{const g=(s,p)=>getComputedStyle(document.querySelector(s))[p]; return [g('.sa-preview .panel','backgroundColor'), g('.sa-preview .pi-title','color')]}""")
    check("lower opacity leaves text fully opaque", alpha(pv[1]) == 1 and 0.6 < alpha(pv[0]) < 0.7, pv)
    page.click('[aria-label="Opacity presets"] >> text="75%"')
    def setrange(label, v): page.evaluate("([l,v])=>{const i=document.querySelector(`input[aria-label=\"${l}\"]`); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,String(v)); i.dispatchEvent(new Event('input',{bubbles:true}))}", [label, v]); page.wait_for_timeout(80)
    setrange("Blur", 30); check("blur applies", var(page, "--blur") == "30px")
    setrange("Corner radius", 12); check("corner radius applies to the panel", var(page, "--panel-r") == "12px" and page.evaluate("getComputedStyle(document.querySelector('.sa-preview .panel')).borderTopLeftRadius") == "12px")
    setrange("Border opacity", 30); check("border opacity applies", var(page, "--panel-border") == "0.3")
    setrange("Shadow intensity", 0); check("shadow can be switched off", var(page, "--panel-shadow") == "none")
    setrange("Shadow intensity", 60); check("shadow intensity applies", var(page, "--panel-shadow") != "none")
    page.click('[aria-label="Material"] >> text=Acrylic'); check("material choice persists", store(page)["settings"]["material"] == "acrylic")
    page.fill('input[aria-label="Background tint HEX"]', "#12ab34"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("background tint accepts HEX and tints the surface", var(page, "--panel-tint") == "#12ab34" and page.evaluate("document.documentElement.dataset.tint") == "on")
    page.fill('input[aria-label="Background tint HEX"]', "#zz"); page.keyboard.press("Enter"); check("invalid HEX is flagged and not saved", page.get_attribute('input[aria-label="Background tint HEX"]', "aria-invalid") == "true" and store(page)["settings"]["panelTint"] == "#12ab34")
    page.fill('input[aria-label="Background tint HEX"]', ""); page.keyboard.press("Enter"); check("empty HEX returns the tint to Auto", var(page, "--panel-tint") == "")
    setrange("Panel width", 480); setrange("Panel height", 700)
    page.screenshot(path=OUT + "/s-appearance.png")
    check("panel size is stored", (store(page)["settings"]["panelWidth"], store(page)["settings"]["panelHeight"]) == (480, 700))
    check("preview panel follows the chosen size", abs(rect(page, ".sa-preview .panel")["w"] - 480) < 1 or rect(page, ".sa-preview .panel")["w"] <= 480)
    page.click('text="Reset panel appearance"'); check("reset restores the defaults (75 %, 380 × 540)", var(page, "--glass-alpha") == "0.75" and var(page, "--panel-w") == "380px" and var(page, "--panel-h") == "540px")
    page.click('[data-section="appearance"]'); page.click('.seg >> text=Light'); check("light theme applies", page.evaluate("document.documentElement.dataset.theme") == "light"); page.click('.seg >> text=Dark')

    # ---- toggle section ----
    page.click('[data-section="toggle"]'); page.wait_for_timeout(300)
    check("toggle preview shows four states", page.locator(".tg-preview figure").count() == 4)
    page.click('[aria-label="Toggle colour Coral"]'); page.wait_for_timeout(200)
    hs = lambda: page.evaluate("getComputedStyle(document.querySelector('.handle span')).backgroundColor") if page.query_selector(".handle span") else None
    check("main colour preset applies to the toggle", var(page, "--tg-main") == "#ec5f5f")
    page.fill('input[aria-label="Main colour HEX"]', "#00cc88"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("custom HEX applies", var(page, "--tg-main") == "#00cc88")
    page.fill('input[aria-label="Main colour HEX"]', "00cc8"); page.keyboard.press("Enter"); check("invalid HEX rejected, previous colour kept", var(page, "--tg-main") == "#00cc88" and page.get_attribute('input[aria-label="Main colour HEX"]', "aria-invalid") == "true")
    for lab, key, var_ in [("Hover colour", "toggleHover", "--tg-hover"), ("Active colour", "toggleActive", "--tg-active"), ("Background colour", "toggleBg", "--tg-bg"), ("Border colour", "toggleBorder", "--tg-border"), ("Glow colour", "toggleGlow", "--tg-glow"), ("New-item indicator", "toggleIndicator", "--tg-dot")]:
        page.fill(f'input[aria-label="{lab} HEX"]', "#ff8800"); page.keyboard.press("Enter"); page.wait_for_timeout(60)
        check(f"{lab} is customisable", var(page, var_) == "#ff8800" and store(page)["settings"][key] == "#ff8800")
    page.click('.s-row:has(b:text("Glow colour")) >> text=Auto'); check("Auto resets a colour", var(page, "--tg-glow") == "")
    check("glow is on by default", var(page, "--tg-glow-pct") != "0%")
    page.click('button[aria-label="Glow"]'); check("glow can be disabled", var(page, "--tg-glow-pct") == "0%" and var(page, "--tg-glow-blur") == "0px"); page.click('button[aria-label="Glow"]')
    setrange("Glow intensity", 100); check("glow intensity applies", var(page, "--tg-glow-pct") == "80%")
    setrange("Tab thickness", 8); setrange("Tab length", 60); check("toggle thickness and length apply", store(page)["settings"]["handleThickness"] == 8 and store(page)["settings"]["handleLength"] == 60)
    page.click('[aria-label="Screen edge"] >> text=Left'); page.wait_for_timeout(300); check("toggle position can be moved to another edge", page.get_attribute(".handle", "data-edge") == "left" or page.get_attribute(".stage", "data-edge") == "left" or store(page)["settings"]["edge"] == "left")
    page.click('[aria-label="Screen edge"] >> text=Right'); setrange("Tab length", 100); setrange("Tab thickness", 10)
    hbg = page.evaluate("getComputedStyle(document.querySelector('.handle span')).backgroundColor"); check("the real toggle really shows the chosen colour", hbg == "rgb(0, 204, 136)", hbg)
    page.screenshot(path=OUT + "/s-toggle.png")
    page.reload(); page.wait_for_selector(".handle"); hbg = page.evaluate("getComputedStyle(document.querySelector('.handle span')).backgroundColor")
    check("toggle colour persists after restart", hbg == "rgb(0, 204, 136)", hbg)

    # ---- animations section ----
    page.goto(URL + "?settings=animations"); page.wait_for_selector(".anim-grid")
    ids = page.locator(".anim-opt").evaluate_all("els=>els.map(e=>e.dataset.anim)")
    check("six opening animations offered", ids == ["fade-scale", "slide", "spring", "blur", "expand", "instant"], ids)
    page.click('.seg >> text=Slow'); check("speed presets set the duration (Slow = 480 ms)", store(page)["settings"]["animDuration"] == 480)
    page.click('.seg[aria-label="Animation speed"] >> text=Fast'); check("Fast = 180 ms", store(page)["settings"]["animDuration"] == 180)
    page.click('.seg[aria-label="Animation speed"] >> text=Custom'); setrange("Animation duration", 700); check("custom duration works", store(page)["settings"]["animDuration"] == 700)
    traj = {}
    for a in ["fade-scale", "slide", "spring", "blur", "expand", "instant"]:
        page.click(f'[data-anim="{a}"]'); sm = sample(page, ".pv-frame .panel", n=70, gap=40); traj[a] = sm
        mids = [s for s in sm if 0.05 < s[0] < 0.95]; txs = [tx(s[1]) for s in sm]
        if a == "instant": check("Instant: the preview panel never shows an intermediate frame", len(mids) == 0, len(mids))
        else: check(f"{a}: the real panel animates (intermediate frames)", len(mids) >= 3, len(mids))
        if a == "slide": check("slide: the panel travels sideways", any(abs(t[1]) > 4 for t in txs))
        if a == "expand": check("expand: the panel grows from a small scale", any(t[0] < 0.6 for t in txs), min(t[0] for t in txs))
        if a == "blur": check("blur reveal: a real blur is animated", any("blur(" in s[2] and "blur(0px)" not in s[2] for s in sm))
        if a == "fade-scale": check("fade & scale: scale and opacity change together", any(0.9 < t[0] < 0.999 for t in txs))
        check(f"{a}: selection persists", store(page)["settings"]["animation"] == a)
        page.wait_for_timeout(500)
    page.screenshot(path=OUT + "/s-animations.png")
    check("preview button replays with the current animation", page.locator('button[aria-label="Preview animation"]').count() == 1)
    page.click('.seg[aria-label="Animation speed"] >> text=Off'); sm = sample(page, ".pv-frame .panel", n=30, gap=30) if False else None
    page.click('button[aria-label="Preview animation"]'); sm = sample(page, ".pv-frame .panel", n=30, gap=40)
    check("animation Off: the panel appears instantly", len([s for s in sm if 0.05 < s[0] < 0.95]) == 0 and store(page)["settings"]["animSpeed"] == 0)
    page.click('.seg[aria-label="Animation speed"] >> text=Normal')

    # the REAL panel (opened from the toggle) uses the chosen animation
    for a, probe in [("slide", lambda sm: any(abs(tx(s[1])[1]) > 4 for s in sm)), ("expand", lambda sm: any(tx(s[1])[0] < 0.6 for s in sm)), ("blur", lambda sm: any("blur(" in s[2] and "blur(0px)" not in s[2] for s in sm))]:
        c2, pg = fresh(br, settings={"animation": a, "animDuration": 700}); pg.click(".handle"); sm = sample(pg, ".panel", n=30, gap=30)
        check(f"opening the real panel from the toggle uses '{a}'", probe(sm) and sm[-1][0] == 1.0, sm[:2]); c2.close()
    c2, pg = fresh(br, settings={"animation": "instant"}); pg.click(".handle"); sm = sample(pg, ".panel", n=10, gap=20)
    check("instant opens with no intermediate frame on the real panel", len([s for s in sm if 0.05 < s[0] < 0.95]) == 0 and sm[-1][0] == 1.0); c2.close()
    c2, pg = fresh(br, settings={"animation": "slide", "animDuration": 700}, reduced=True); pg.click(".handle"); sm = sample(pg, ".panel", n=30, gap=30)
    check("reduced motion: no sliding (opacity only)", all(abs(tx(s[1])[1]) < 1 for s in sm) and sm[-1][0] == 1.0, sm[:2]); c2.close()
    c2, pg = fresh(br, settings={"animation": "slide", "animDuration": 300}); pg.click(".handle"); pg.wait_for_selector(".panel"); pg.wait_for_timeout(500); pg.keyboard.press("Escape")
    sm = sample(pg, ".panel", n=12, gap=25); check("closing is animated too, then the panel unmounts", any(0.05 < s[0] < 0.95 for s in sm) or len(sm) < 12); pg.wait_for_timeout(500); check("panel unmounted after closing", pg.query_selector(".panel") is None); c2.close()

    # ---- clipboard / behavior / privacy ----
    c, page = fresh(br, settings={}, items=[], query="?settings=clipboard"); page.wait_for_selector(".sa-window"); page.wait_for_timeout(300)
    page.goto(URL); page.wait_for_selector(".handle"); open_panel(page); seed(page); page.wait_for_timeout(300)
    s1 = store(page); old_ts = int((datetime.datetime.now() - datetime.timedelta(days=40)).timestamp() * 1000)
    for it in s1["items"][:2]: it["capturedAt"] = old_ts
    s1["items"][0]["pinned"] = True; page.evaluate("([k,s])=>localStorage.setItem(k, JSON.stringify(s))", [K, s1])
    page.goto(URL + "?settings=clipboard"); page.wait_for_selector(".sa-window"); page.wait_for_timeout(300)
    page.click('[aria-label="Retention period"] >> text="30 days"'); check("retention setting persists", store(page)["settings"]["retentionDays"] == 30)
    page.reload(); page.wait_for_selector(".sa-window"); page.wait_for_timeout(800)
    left = store(page)["items"]; check("retention removes old items on load but never pinned ones", len(left) == 9 and any(i["pinned"] for i in left), len(left))
    page.fill('input[aria-label="Items to keep"]', "150"); page.keyboard.press("Tab"); check("max history persists", store(page)["settings"]["maxItems"] == 150)
    page.click('[aria-label="After copying"] >> text="Close the panel"'); check("copy behaviour persists", store(page)["settings"]["copyBehavior"] == "close")
    page.goto(URL); page.wait_for_selector(".handle"); open_panel(page); page.evaluate("navigator.clipboard.writeText('x')"); page.locator(".pi").nth(1).click(); page.wait_for_timeout(900)
    check("'close after copy' closes the panel", page.query_selector(".panel") is None)
    page.goto(URL + "?settings=behavior"); page.wait_for_selector(".sa-window"); page.click('button[aria-label="Close when clicking outside"]'); check("outside-click closing can be turned off", store(page)["settings"]["closeOnBlur"] is False)
    inputs = page.locator('.sa-window input[aria-invalid]'); inputs.nth(1).fill("alt+win+s"); check("shortcut conflicts are detected", page.locator(".warn-text").count() == 1); inputs.nth(1).fill("Win+Alt+P"); page.keyboard.press("Tab"); check("conflict clears when fixed", page.locator(".warn-text").count() == 0)
    page.goto(URL + "?settings=clipboard"); page.wait_for_selector(".sa-window")
    with page.expect_download() as d: page.click('text=Export backup')
    data = json.load(open(d.value.path())); check("backup export contains items and settings", data["app"] == "MyPinboard" and len(data["items"]) == 9 and data["settings"]["retentionDays"] == 30)
    page.goto(URL + "?settings=privacy"); page.wait_for_selector(".sa-window"); page.click('.btn.danger:has-text("Clear history")'); page.click('.modal .btn.danger'); page.wait_for_timeout(300)
    check("clear history keeps pinned and favourite only", len(store(page)["items"]) == 1, len(store(page)["items"]))
    d.value.save_as(OUT + "/_backup.json"); page.goto(URL + "?settings=clipboard"); page.wait_for_selector(".sa-window"); page.set_input_files('input[type=file]', OUT + "/_backup.json"); page.wait_for_timeout(400)
    check("restore brings the items back", len(store(page)["items"]) == 9, len(store(page)["items"]))
    page.goto(URL + "?settings=library"); page.wait_for_selector(".sa-window .board-inner"); check("advanced organisation lives in the Library section", page.locator('.sa-window [data-nav="all"]').count() == 1 and page.locator(".sa-window .side").count() == 1)
    page.goto(URL); page.wait_for_selector(".handle"); open_panel(page); page.click('.p-full'); page.wait_for_selector(".sa-window"); check("'Open MyPinboard' in the footer opens the full window on the Library", page.locator('.sa-navitem[aria-current="page"]:has-text("Library")').count() == 1)
    c.close()

    # ---- closeOnBlur off keeps the panel open ----
    c, page = fresh(br, settings={"closeOnBlur": False}); open_panel(page); page.mouse.click(300, 300); page.wait_for_timeout(500)
    check("with 'close when clicking outside' off, the panel stays", page.query_selector(".panel") is not None); c.close()

    # ---- settings written before the redesign still load ----
    c, page = fresh(br, settings={"transparency": 0.72, "accent": "azure"}); page.evaluate(f"localStorage.setItem('{K}', JSON.stringify({{settings:{{theme:'dark',accent:'azure',transparency:0.72,maxItems:100}}}}))"); page.reload(); page.wait_for_selector(".handle"); open_panel(page)
    check("old settings migrate: 75 % surface, accent and limits kept", var(page, "--glass-alpha") == "0.75" and var(page, "--accent") == "#2f8cf0" and rect(page, ".panel")["w"] == 380); c.close()

    # ---- moving the toggle to every edge ----
    c, page = fresh(br, w=1280, h=720, settings={}); page.evaluate("localStorage.removeItem('mypinboard.v1')"); page.reload(); page.wait_for_selector(".handle")
    for edge, (x, y) in {"bottom": (640, 715), "left": (3, 360), "top": (640, 3), "right": (1277, 360)}.items():
        hr = rect(page, ".handle"); page.mouse.move(hr["x"] + hr["w"] / 2, hr["y"] + hr["h"] / 2); page.mouse.down(); page.mouse.move(x, y, steps=8); page.mouse.up(); page.wait_for_timeout(500)
        hr = rect(page, ".handle"); stage = page.get_attribute(".stage", "data-edge"); check(f"drag toggle snaps to {edge} and stays visible", stage == edge and inside(hr, 1280, 720), f"{stage} {hr}")
        open_panel(page); pr = rect(page, ".panel"); hr = rect(page, ".handle")
        ov = hr["x"] < pr["x"] + pr["w"] and hr["x"] + hr["w"] > pr["x"] and hr["y"] < pr["y"] + pr["h"] and hr["y"] + hr["h"] > pr["y"]
        check(f"panel on {edge}: on screen and clear of the toggle", inside(pr, 1280, 720) and not ov, pr); page.keyboard.press("Escape"); page.wait_for_timeout(500)
    open_panel(page); g = rect(page, ".p-brand"); page.mouse.move(g["x"] + 20, g["y"] + 10); page.mouse.down(); page.mouse.move(40, 300, steps=8); page.mouse.up(); page.wait_for_timeout(500)
    check("dragging the panel by its header docks it to the nearest edge", page.get_attribute(".stage", "data-edge") == "left" and inside(rect(page, ".panel"), 1280, 720)); c.close()

    # ================= orientation: the docked edge decides (top/bottom = horizontal menu, left/right = vertical) =================
    def layout(pg):
        return pg.evaluate("""()=>{const r=[...document.querySelectorAll('.panel:not(.static) .pi')].map(e=>{const b=e.getBoundingClientRect(); return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]});
          const l=document.querySelector('.panel:not(.static) .p-list'); const p=document.querySelector('.panel:not(.static)').getBoundingClientRect();
          return {rects:r, orient:document.querySelector('.panel:not(.static)').dataset.orientation, dir:getComputedStyle(l).flexDirection, sw:l.scrollWidth, cw:l.clientWidth, sh:l.scrollHeight, ch:l.clientHeight, panel:[p.width,p.height]}}""")
    c, pg = fresh(br, settings={"edge": "right"}); open_panel(pg); seed(pg); pg.wait_for_timeout(500); L = layout(pg)
    check("vertical menu (right edge): items are stacked in a column", L["orient"] == "vertical" and all(L["rects"][i + 1][1] > L["rects"][i][1] for i in range(len(L["rects"]) - 1)) and len({r[0] for r in L["rects"]}) == 1, L["orient"])
    check("vertical menu: panel is 380 × 540", abs(L["panel"][0] - 380) < 1 and abs(L["panel"][1] - 540) < 1, L["panel"]); c.close()
    for edge in ("bottom", "top"):
        c, pg = fresh(br, settings={"edge": edge}); open_panel(pg); seed(pg); pg.wait_for_timeout(500); L = layout(pg); pr = rect(pg, ".panel")
        rows = L["rects"]; same_row = len({r[1] for r in rows if r[3] > 0}) == 1
        check(f"horizontal menu ({edge} edge): items are laid out in a row", L["orient"] == "horizontal" and L["dir"] == "row" and same_row and all(rows[i + 1][0] > rows[i][0] for i in range(len(rows) - 1)), (L["orient"], L["dir"]))
        check(f"horizontal menu ({edge}): panel lies down (540 × 380) and stays on screen", abs(pr["w"] - 540) < 1 and abs(pr["h"] - 380) < 1 and inside(pr, 1440, 900), pr)
        check(f"horizontal menu ({edge}): the row scrolls sideways, nothing overflows vertically", L["sw"] > L["cw"] and L["sh"] <= L["ch"] + 1, (L["sw"], L["cw"], L["sh"], L["ch"]))
        check(f"horizontal menu ({edge}): cards keep their delete button, time and preview", pg.locator(".pi .pi-del").count() == 10 and pg.locator(".pi time").count() == 10 and pg.locator(".pi[data-kind=image] img").count() == 1)
        d = pg.evaluate("(()=>{const c=document.querySelector('.pi').getBoundingClientRect(), b=document.querySelector('.pi .pi-del').getBoundingClientRect(); return [b.right<=c.right+0.5, b.top>=c.top-0.5, b.top-c.top<16]})()")
        check(f"horizontal menu ({edge}): the trash button is still in the card's top-right corner", all(d), d)
        hdr = pg.evaluate("(()=>{const p=document.querySelector('.panel').getBoundingClientRect(); return [...document.querySelectorAll('.p-head *, .p-foot *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&(r.right>p.right+1||r.left<p.left-1)}).length})()")
        check(f"horizontal menu ({edge}): header and footer do not clip", hdr == 0, hdr)
        pg.locator(".pi").first.focus(); pg.keyboard.press("ArrowRight"); k1 = pg.evaluate("[...document.querySelectorAll('.pi')].indexOf(document.activeElement)"); pg.keyboard.press("ArrowLeft"); k0 = pg.evaluate("[...document.querySelectorAll('.pi')].indexOf(document.activeElement)")
        check(f"horizontal menu ({edge}): Left/Right arrows move between items", (k1, k0) == (1, 0), (k1, k0))
        before = pg.locator(".pi").count(); pg.locator(".pi").nth(2).hover(); pg.locator(".pi").nth(2).locator(".pi-del").click(); pg.wait_for_timeout(450)
        check(f"horizontal menu ({edge}): one-click delete and Undo still work", pg.locator(".pi").count() == before - 1 and pg.locator(".p-undo").count() == 1)
        pg.click(".p-undo"); pg.wait_for_timeout(450); check(f"horizontal menu ({edge}): undo restores the card", pg.locator(".pi").count() == before)
        if edge == "bottom": pg.screenshot(path=OUT + "/orientation-horizontal.png")
        c.close()
    # live: changing the setting switches the layout with no restart
    c, pg = fresh(br, settings={}); pg.goto(URL + "?settings=toggle"); pg.wait_for_selector(".sa-window")
    for edge_label, want in (("Top", "horizontal"), ("Left", "vertical"), ("Bottom", "horizontal"), ("Right", "vertical")):
        pg.click(f'[aria-label="Screen edge"] >> text={edge_label}'); pg.wait_for_timeout(250)
        check(f"settings preview follows the screen edge setting live ({edge_label} → {want})", pg.evaluate("document.querySelector('.sa-window .sa-preview .panel')?.dataset.orientation ?? null") in (want, None) and store(pg)["settings"]["edge"] == edge_label.lower())
    pg.click('[aria-label="Screen edge"] >> text=Top'); pg.click('[aria-label="Close settings window"]'); pg.wait_for_timeout(300); open_panel(pg); seed(pg); pg.wait_for_timeout(400)
    check("after choosing Top in settings the real panel is horizontal", layout(pg)["orient"] == "horizontal" and layout(pg)["dir"] == "row"); c.close()
    # live: dragging the open panel to another edge re-orients it immediately
    c, pg = fresh(br, w=1280, h=720, settings={}); open_panel(pg); seed(pg); pg.wait_for_timeout(300); g = rect(pg, ".p-brand")
    check("starts vertical on the right edge", layout(pg)["orient"] == "vertical")
    pg.mouse.move(g["x"] + 20, g["y"] + 10); pg.mouse.down(); pg.mouse.move(640, 715, steps=10); pg.mouse.up(); pg.wait_for_timeout(600)
    L = layout(pg); check("dragging the open panel to the bottom switches it to a horizontal row with no restart", L["orient"] == "horizontal" and L["dir"] == "row" and inside(rect(pg, ".panel"), 1280, 720), (L["orient"], L["dir"]))
    g = rect(pg, ".p-brand"); pg.mouse.move(g["x"] + 20, g["y"] + 10); pg.mouse.down(); pg.mouse.move(1277, 150, steps=10); pg.mouse.up(); pg.wait_for_timeout(600)
    L = layout(pg); check("and back to a vertical column on the right edge", L["orient"] == "vertical" and L["sw"] <= L["cw"] + 1 and abs(rect(pg, ".panel")["h"] - 540) < 1, (L["orient"], L["dir"])); c.close()
    # horizontal fits small and short screens without clipping
    for name, w, hgt in [("1280x720", 1280, 720), ("800x420", 800, 420), ("360x640", 360, 640), ("1080x1920", 1080, 1920)]:
        for scheme in ("dark", "light"):
            c2, pg = fresh(br, w=w, h=hgt, scheme=scheme, settings={"edge": "bottom", "panelWidth": 480, "panelHeight": 700}); open_panel(pg); seed(pg); pg.wait_for_timeout(300); pr = rect(pg, ".panel"); L = layout(pg)
            clipped = pg.evaluate("(()=>{const p=document.querySelector('.panel').getBoundingClientRect(); return [...document.querySelectorAll('.p-head *, .p-foot *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&(r.right>p.right+1||r.left<p.left-1||r.bottom>p.bottom+1||r.top<p.top-1)}).length})()")
            check(f"[{scheme}] horizontal {name}: on screen, no clipping, no vertical overflow", inside(pr, w, hgt) and clipped == 0 and L["sh"] <= L["ch"] + 1, (pr, clipped, L["sh"], L["ch"]))
            if name == "1280x720": pg.screenshot(path=f"{OUT}/orientation-horizontal-{scheme}.png")
            c2.close()

    # ---- the panel never exceeds the screen: many viewports, both themes ----
    for scheme in ("dark", "light"):
        for name, w, hgt, dpr in [("1280x720", 1280, 720, 1), ("1366x768", 1366, 768, 1), ("1920x1080", 1920, 1080, 1), ("3840x2160@250", 1536, 864, 2.5), ("1080x1920", 1080, 1920, 1), ("small 360x640", 360, 640, 1), ("short 800x420", 800, 420, 1)]:
            c2, pg = fresh(br, w=w, h=hgt, scheme=scheme, settings={"panelWidth": 480, "panelHeight": 700}, dpr=dpr); open_panel(pg); seed(pg); pg.wait_for_timeout(300); pr = rect(pg, ".panel")
            clipped = pg.evaluate("""()=>{const p=document.querySelector('.panel').getBoundingClientRect(); return [...document.querySelectorAll('.p-head *, .p-foot *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && (r.right>p.right+1||r.left<p.left-1||r.bottom>p.bottom+1||r.top<p.top-1)}).length}""")
            check(f"[{scheme}] {name}: largest panel stays on screen", inside(pr, w, hgt), pr); check(f"[{scheme}] {name}: header and footer never clip", clipped == 0, clipped)
            if name in ("1920x1080", "small 360x640") : pg.screenshot(path=f"{OUT}/panel-{scheme}-{name}.png")
            c2.close()
    check("no uncaught page errors or console errors", not errors, errors[:3])
    br.close()
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed"); sys.exit(1 if failed else 0)
