from playwright.sync_api import sync_playwright
import common
B=common.B+"/resident-app"; P="C:/Users/user/Straysafe2.0/scratch/demo-photos"
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':430,'height':900},geolocation={'latitude':14.8008,'longitude':121.0035},permissions=['geolocation'])
    pg=ctx.new_page(); common.login_res(pg)
    pg.goto(B+"/pets/new"); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder=Mochi]','Bruno'); pg.click('label:has-text("Dog")'); pg.click('label:has-text("Male")')
    pg.fill('input[placeholder*="Shih"]','Siberian Husky'); pg.fill('input[placeholder*="Type a colour"]','Black'); pg.keyboard.press('Enter'); pg.keyboard.type('White'); pg.keyboard.press('Enter')
    pg.fill('[placeholder="3 years"]','3 years'); pg.fill('[placeholder*="Gold ear"]','Blue collar with a name tag')
    pg.set_input_files('input[type=file] >> nth=2',P+"/e72a54eb-2609-45dc-9435-84ffbbb115b4.jpg"); pg.wait_for_timeout(7000)
    pg.click('button:has-text("Register pet")'); pg.wait_for_function("()=>!location.pathname.endsWith('/new')",timeout=60000); pg.wait_for_timeout(2500); print('pet ok', pg.url[-14:])
    pg.goto(B+"/report/situation"); pg.wait_for_timeout(1200); pg.click('text=It looks lost or has no owner nearby'); pg.wait_for_timeout(1500)
    pg.set_input_files('input[type=file] >> nth=2',P+"/images (4).jpg"); pg.wait_for_timeout(8000)
    pg.click('label:has-text("Cat")'); pg.fill('input[placeholder*="Type a colour"]','Brown'); pg.keyboard.press('Enter'); pg.keyboard.type('Black'); pg.keyboard.press('Enter')
    pg.fill('input[placeholder*="Aspin"]','Tabby'); pg.fill('textarea','Small tabby kitten, very friendly, no collar. It was meowing near the playground.')
    pg.fill('input[type=datetime-local]','2026-11-20T09:30'); pg.select_option('select','Where I found it'); pg.click('button:has-text("Continue")'); pg.wait_for_timeout(2000)
    pg.click('text=Selera Community Park & Clubhouse'); pg.wait_for_timeout(1200); pg.click('button:has-text("Confirm location")'); pg.wait_for_timeout(2500)
    pg.locator('button:has-text("Submit for review")').last.click(); pg.wait_for_url('**/report/submitted/**',timeout=60000); print('report ok')
    b.close()
