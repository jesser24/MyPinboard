"""Library view (collections, favourites, tags, multi-select, palette, grid, drag to collection). Lives in the settings window; opened here through the ?settings=library deep link.
Browser-level (Chromium on Linux). NOT a Windows test."""
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

def openlib(page):
    if page.query_selector(".sa-window") is None:
        page.goto(URL + "?settings=library"); page.wait_for_selector(".sa-window .board-inner"); page.wait_for_timeout(300)
def rect(page, sel):
    return page.evaluate("(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}}", sel)
def inside(r, vw, vh): return r and r["x"] >= -0.5 and r["y"] >= -0.5 and r["x"] + r["w"] <= vw + 0.5 and r["y"] + r["h"] <= vh + 0.5

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 720}, color_scheme="dark", permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e))); page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_selector(".handle")

    openlib(page)
    # --- capture via paste / drop-like ingestion ---
    page.keyboard.press("Escape"); page.wait_for_timeout(500); openlib(page)
    seed(page)
    n = page.locator(".card").count(); check("paste captured text, URLs, files and image as cards", n == 10, n)
    page.evaluate(PASTE, {"text": "https://react.dev/learn"}); page.wait_for_timeout(100)
    check("duplicate paste does not add a card", page.locator(".card").count() == 10)
    check("URL classified as link", page.locator('.card[data-kind="url"]').count() == 2)
    check("image card has a thumbnail", page.locator('.card[data-kind="image"] img').count() == 1)

    # --- search / filters ---
    page.fill(".search input", "tauri"); page.wait_for_timeout(400); check("search filters (debounced 120 ms)", page.locator(".card").count() == 1)
    page.fill(".search input", "client devis"); page.wait_for_timeout(400); check("multi-token, accent-insensitive search", page.locator(".card").count() == 1)
    page.fill(".search input", ""); page.wait_for_timeout(250); page.click('[data-nav="images"]'); check("type section (Images) filters", page.locator(".card").count() == 1 and page.inner_text(".title").startswith("Images")); page.click('[data-nav="all"]')

    # --- context menu actions ---
    card = page.locator('.card:has-text("Quarterly report.pdf")'); card.click(button="right"); page.click('.menu >> text=Pin'); page.wait_for_timeout(400)
    check("moving between groups leaves no duplicate card behind", card.count() == 1, card.count())
    check("pin via context menu floats card first", page.locator(".card").first.get_attribute("aria-label").endswith("Quarterly report.pdf"))
    card.click(button="right"); page.click('.menu >> text=Favourite'); check("favourite flag shown", page.locator(".card .fav").count() == 1)
    card.click(button="right"); page.click('.menu >> text=Rename label'); page.fill(".modal input", "Q3 Report"); page.click('.modal button:has-text("Save")')
    check("rename label", page.locator('.card:has-text("Q3 Report")').count() == 1)
    card = page.locator('.card:has-text("Q3 Report")'); card.click(button="right"); page.click('.menu >> text=Add tag'); page.fill(".modal input", "Finance"); page.keyboard.press("Enter")
    check("tag added and filterable", page.locator(".card .tag").count() == 1); page.locator(".card .tag").click(); check("tag filter", page.locator(".card").count() == 1); page.click('.chip button[aria-label^="Remove tag filter"]')
    page.locator('.card:has-text("budget.xlsx")').click(button="right"); page.click('.menu >> text=Move to collection'); page.click('.menu >> text=Work')
    page.click('[data-nav="c:work"]'); check("move to collection + collection section", page.locator(".card").count() == 1); page.click('[data-nav="all"]')
    page.locator('.card:has-text("notes.md")').click(button="right"); page.click('.menu >> text=Remove from board'); page.click('.modal button:has-text("Remove")'); page.wait_for_timeout(400)
    check("remove (with confirmation)", page.locator('.card:has-text("notes.md")').count() == 0)
    page.locator('.card:has-text("react.dev")').first.click(); page.wait_for_timeout(200)
    check("single click copies to clipboard", "react.dev" in page.evaluate("navigator.clipboard.readText()"))
    page.locator('.card[data-kind="text"]').first.dblclick(); check("double-click text opens editor", page.locator(".modal textarea").count() == 1); page.keyboard.press("Escape")

    # --- persistence ---
    page.reload(); page.wait_for_selector(".sa-window .card")
    check("items persist across reload", page.locator(".card").count() == 9, page.locator(".card").count())
    check("pinned/favourite/rename persist", page.locator('.card:has-text("Q3 Report")').count() == 1 and page.locator(".card .fav").count() == 1)

    # --- redesign features ---
    page.keyboard.press("Control+k"); page.wait_for_selector(".palette")
    page.fill(".palette input", "dark"); page.wait_for_timeout(100); page.keyboard.press("Enter"); page.wait_for_timeout(400)
    check("command palette (Ctrl+K) runs a command", page.evaluate("document.documentElement.dataset.theme") == "dark" and page.locator(".palette").count() == 0)
    page.keyboard.press("Control+k"); page.wait_for_selector(".palette"); page.keyboard.press("Escape"); page.wait_for_timeout(250)
    check("Escape closes only the palette, not the board", page.locator(".palette").count() == 0 and page.query_selector(".sa-window .board-inner") is not None)

    page.click('[aria-label="Grid view"]'); page.wait_for_timeout(250)
    check("grid view renders tiles with an image thumbnail", page.locator('.card[data-view="grid"]').count() == 9 and page.locator('.card[data-view="grid"] .thumb img').count() == 1)
    page.click('[aria-label="List view"]'); page.wait_for_timeout(250)
    check("list view restored", page.locator('.card[data-view="list"]').count() == 9)

    page.locator(".card").nth(0).hover(); page.locator(".card .check").nth(0).click(); page.locator(".card").nth(1).hover(); page.locator(".card .check").nth(1).click()
    check("multi-select shows the selection bar", page.inner_text(".selbar .count").startswith("2 selected"))
    page.keyboard.press("Escape"); page.wait_for_timeout(450)
    check("Escape clears the selection first (board stays open)", page.locator(".selbar").count() == 0 and page.query_selector(".sa-window .board-inner") is not None)
    page.locator(".card").first.focus(); page.keyboard.press("Control+a"); check("Ctrl+A selects all visible", page.inner_text(".selbar .count").startswith("9 selected")); page.keyboard.press("Escape"); page.wait_for_timeout(250)

    page.locator(".card").first.focus(); page.keyboard.press("ArrowDown")
    check("arrow keys move focus between items", page.evaluate("document.activeElement === document.querySelectorAll('.card')[1]"))
    page.keyboard.press("Space"); page.wait_for_selector(".modal"); check("Space opens the full-content viewer", page.locator(".modal .viewer-text").count() == 1); page.keyboard.press("Escape"); page.wait_for_timeout(250)

    page.click('[aria-label="New collection"]'); page.fill(".modal input", "Research"); page.keyboard.press("Enter"); page.wait_for_timeout(250)
    check("create collection opens it, with an empty state", page.inner_text(".title").startswith("Research") and "is empty" in page.inner_text(".empty h2"))
    page.click('[data-nav^="c:"]:has-text("Research")', button="right"); page.click('.menu >> text=Rename'); page.fill(".modal input", "Reading"); page.click('.modal button:has-text("Save")'); page.wait_for_timeout(200)
    check("rename collection", page.locator('[data-nav^="c:"]:has-text("Reading")').count() == 1)
    page.click('[data-nav^="c:"]:has-text("Reading")', button="right"); page.click('.menu >> text=Delete collection'); page.click('.modal .btn.danger'); page.wait_for_timeout(250)
    check("delete collection (confirmed) removes it and returns to All items", page.locator('[data-nav^="c:"]:has-text("Reading")').count() == 0 and page.inner_text(".title").startswith("All items"))

    page.click('[data-nav="c:development"]'); page.wait_for_timeout(250); before = page.locator(".card").count(); page.click('[data-nav="all"]'); page.wait_for_timeout(250)
    c0 = rect(page, ".card"); t0 = rect(page, '[data-nav="c:development"]')
    page.mouse.move(c0["x"] + 120, c0["y"] + c0["h"] / 2); page.mouse.down(); page.mouse.move(c0["x"] + 60, c0["y"] + 40, steps=4); page.mouse.move(t0["x"] + t0["w"] / 2, t0["y"] + t0["h"] / 2, steps=8)
    hot = page.locator('[data-nav="c:development"][data-drop="hot"]').count(); page.mouse.up(); page.wait_for_timeout(300)
    page.click('[data-nav="c:development"]'); page.wait_for_timeout(250); after = page.locator(".card").count(); page.click('[data-nav="all"]'); page.wait_for_timeout(250)
    check("dragging an item onto a collection files it there", hot == 1 and after == before + 1, f"hot={hot} {before}->{after}")

    page.fill(".search input", "zzzzqq"); page.wait_for_timeout(250)
    check("no-results empty state explains and offers a way out", "No matches" in page.inner_text(".empty h2") and page.locator('.empty .btn:has-text("Clear search")').count() == 1)
    page.click('.empty .btn'); page.wait_for_timeout(250); check("clear search restores the list", page.locator(".card").count() == 9)

    page.keyboard.press("Control+f"); page.wait_for_timeout(100); check("Ctrl+F focuses search", page.evaluate("document.activeElement.getAttribute('aria-label')") == "Search")

    # --- library layout at several window sizes, both themes ---
    for scheme in ("dark", "light"):
        for name, w, hgt in [("1024x700", 1024, 700), ("1280x720", 1280, 720), ("1920x1080", 1920, 1080), ("2560x1440", 2560, 1440)]:
            c2 = br.new_context(viewport={"width": w, "height": hgt}, color_scheme=scheme, permissions=["clipboard-read", "clipboard-write"]); pg = c2.new_page()
            pg.goto(URL); pg.wait_for_selector(".handle"); pg.evaluate("(t)=>localStorage.setItem('mypinboard.v1', JSON.stringify({settings:{theme:t}}))", scheme)
            pg.goto(URL + "?settings=library"); pg.wait_for_selector(".sa-window .board-inner"); seed(pg); pg.wait_for_timeout(500)
            win = rect(pg, ".sa-window")
            check(f"[{scheme}] {name}: library window within screen", inside(win, w, hgt), win)
            ov = pg.evaluate("""()=>{const b=document.querySelector('.sa-window .board-inner').getBoundingClientRect(); const bad=[...document.querySelectorAll('.board-inner .bar *, .board-inner .tools')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && (r.right>b.right+1||r.left<b.left-1)}); return bad.length}""")
            check(f"[{scheme}] {name}: no clipped controls in the library header", ov == 0, ov)
            tt = pg.evaluate("(()=>{const t=document.querySelector('.board-inner .title'); return t.scrollWidth<=t.clientWidth+1})()")
            check(f"[{scheme}] {name}: section title is never truncated", tt, pg.inner_text('.board-inner .title'))
            if name in ("1280x720", "1920x1080"): pg.screenshot(path=f"{OUT}/library-{scheme}-{name}.png")
            c2.close()
    check("no uncaught page errors or console errors", not errors, errors[:3])
    br.close()
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed"); sys.exit(1 if failed else 0)
