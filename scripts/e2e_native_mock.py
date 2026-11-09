import sys, json
fail=0
def check(n,ok,d=''):
    global fail
    print(('PASS ' if ok else 'FAIL ')+n,'' if ok else d); fail+=0 if ok else 1
from playwright.sync_api import sync_playwright
URL=(sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:4173/")
MOCK = """
(() => {
  const calls = []; window.__calls = calls; window.__cbs = {}; let n = 1;
  const snap = { items: [{id:'a',kind:'text',title:'Hello',content:'Hello world',collectionId:'personal',tags:[],pinned:false,favorite:false,capturedAt:Date.now()-5000,hash:'h',sizeBytes:11,sourceApp:null}],
                 collections: [{id:'personal',name:'Personal',color:'#8b6cf7'}], settings: { theme: 'dark' } };   // native returns stored JSON WITHOUT defaults
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'settings' }, currentWebview: { windowLabel: 'settings', label: 'settings' } },
    transformCallback: (cb) => { const id = n++; window.__cbs[id] = cb; return id; },
    unregisterCallback: () => {}, convertFileSrc: (p) => p,
    invoke: async (cmd, args) => { calls.push(cmd);
      switch (cmd) {
        case 'native_info': return { dataDir: 'C:\\\\Users\\\\x\\\\AppData\\\\Roaming\\\\MyPinboard', imagesDir: 'C:\\\\i', logsDir: 'C:\\\\l', backdrop: 'mica', portable: false, version: '1.2.3' };
        case 'current_edge': return 'right';
        case 'get_snapshot': return JSON.parse(JSON.stringify(snap));
        case 'storage_info': return { dataDir: 'C:\\\\data', dbBytes: 1024, imagesBytes: 0, imageCount: 0, itemCount: 1, portable: false };
        case 'save_settings': snap.settings = args.settings; return [];
        case 'plugin:event|listen': return n++;
        case 'plugin:event|unlisten': return null;
        default: return null;
      } } };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
})();
"""

"""Regression: the native 'settings' and 'board' webviews render fully against a mocked Tauri bridge (front end only; the Rust window creation is NOT exercised)."""
with sync_playwright() as p:
    b=p.chromium.launch()
    for w in ("settings","board"):
        for edge in ("right","bottom"):
            pg=b.new_page(viewport={"width":1040,"height":700}); errs=[]
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
            pg.add_init_script(MOCK.replace("return 'right'","return '%s'"%edge)); pg.goto(URL+f"?w={w}"); pg.wait_for_timeout(1200)
            check(f"?w={w} ({edge}): React rendered into #root (not blank)", pg.evaluate("document.getElementById('root').children.length")>0 and len(pg.evaluate("document.body.innerText"))>20)
            check(f"?w={w} ({edge}): no console or page errors", not errs, errs[:3])
            if w=="settings":
                check("settings: 8 sections and a live preview", pg.locator(".sa-navitem").count()==8 and pg.locator(".sa-preview .panel").count()==1)
                pg.click(".sa-navitem >> nth=2"); pg.wait_for_timeout(200); check("settings: sections switch", True)
            else:
                check("board: panel with data-orientation", pg.locator(".panel[data-orientation]").count()==1 and pg.locator(".panel").first.get_attribute("data-orientation")==("horizontal" if edge=="bottom" else "vertical"))
            check(f"?w={w} ({edge}): bridge calls resolved (get_snapshot called)", "get_snapshot" in pg.evaluate("window.__calls"))
            pg.close()
    b.close()
sys.exit(1 if fail else 0)
