# Two "devices" signed in through a stand-in for Clerk. The stand-in hands the
# page the local test writer's setup token as its session token, so the page's
# Clerk path (late load, sign-in check, sync) runs against the real local Worker.
import os, time
from playwright.sync_api import sync_playwright
EXE=os.environ.get('CHROMIUM')  # None: Playwright's own browser

T=os.environ['E2E_TOKEN']  # a setup token of a writer in the local D1
B='http://127.0.0.1:8820/japan/kansai/osaka/'
HOST='https://novel-warthog-310.clerk.accounts.dev/npm/'
FAKE=f"""window.Clerk={{load:async()=>{{}},user:{{id:'user_fake'}},session:{{getToken:async()=>'{T}'}},
openSignIn(){{}},mountUserButton(el,o){{el.textContent='U';window.__userMenu=(o&&o.customMenuItems||[]).map(i=>i.label+' '+i.href)}},unmountUserButton(){{}},addListener(){{return()=>{{}}}}}};"""
def device(b, writer_known):
    ctx=b.new_context()
    def clerk(route):
        time.sleep(2)  # Clerk arrives late, after the first sync
        route.fulfill(status=200, content_type='text/javascript', body=FAKE if 'clerk-js' in route.request.url else 'window.__internal_ClerkUICtor=function(){};')
    ctx.route(HOST+'**', clerk)
    if writer_known:
        ctx.add_init_script("localStorage.setItem('clerkWriter','e2e')")
    pg=ctx.new_page(); pg.goto(B); pg.wait_for_selector('button.star')
    return pg
def status(pg): return pg.inner_text('#sync-status')
# The local D1 must start with no unlocks or stars for this writer.
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=EXE)
    a=device(b, True)
    a.wait_for_function("document.querySelector('#sync-status').textContent.startsWith('同期済み')", timeout=20000)
    print('A status:', status(a))
    first=a.get_attribute('button.star >> nth=0','data-id')
    a.click(f'button.star[data-id="{first}"][data-stars="5"]')
    a.on('dialog', lambda d: d.accept())
    a.click('button.unlock >> nth=0'); a.wait_for_timeout(3000)
    print('A progress:', a.inner_text('#progress'), '|', status(a))
    c=device(b, True)  # second device that was already confirmed before
    c.wait_for_function("document.querySelector('#sync-status').textContent.startsWith('同期済み')", timeout=20000)
    c.wait_for_timeout(1000)
    c_progress=c.inner_text('#progress')
    menu=c.evaluate('window.__userMenu')
    print('B user menu:', menu)
    pressed=c.locator(f'button.star[data-id="{first}"][aria-pressed="true"]').count()
    print('B star pressed:', pressed, '| B progress:', c.inner_text('#progress'))
    b.close()
    assert menu == ['自分の実績 /u/e2e/'], 'the user menu has no link to the record'
    assert pressed == 5, 'the star set on A did not reach B'
    assert c_progress.startswith('1 /'), 'the unlock made on A did not reach B'
