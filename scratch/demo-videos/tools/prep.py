from playwright.sync_api import sync_playwright
import common
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1600,'height':900}); pg=ctx.new_page(); common.login_leader(pg)
    pg.goto(common.B+"/cases/SS-2026-0002"); pg.wait_for_timeout(2500)
    pg.get_by_role('button',name='Publish notice').first.click(); pg.wait_for_timeout(1200)
    pg.get_by_role('button',name='Publish notice').last.click(); pg.wait_for_timeout(3000); print('published')
    b.close()
