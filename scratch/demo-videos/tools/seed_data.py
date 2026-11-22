from playwright.sync_api import sync_playwright
import common
B=common.B+"/resident-app"
P="C:/Users/user/Straysafe2.0/scratch/demo-photos"
def location(pg,place):
    pg.click(f'text={place}'); pg.wait_for_timeout(1200); pg.click('button:has-text("Confirm location")'); pg.wait_for_timeout(2500)
def submit(pg):
    pg.locator('button:has-text("Submit")').last.click(); pg.wait_for_url('**/report/submitted/**',timeout=60000); print('submitted',pg.url[-14:])
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':430,'height':900},geolocation={'latitude':14.8008,'longitude':121.0035},permissions=['geolocation'])
    pg=ctx.new_page(); common.login_res(pg,"demo.resident2@straysafe.demo")
    # pet
    pg.goto(B+"/pets/new"); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder=Mochi]','Snowy'); pg.click('label:has-text("Dog")'); pg.click('label:has-text("Female")')
    pg.fill('input[placeholder*="Shih"]','Chihuahua'); pg.fill('input[placeholder*="Type a colour"]','White'); pg.keyboard.press('Enter')
    pg.fill('[placeholder="3 years"]','2 years'); pg.fill('[placeholder*="Gold ear"]','Pink collar')
    pg.set_input_files('input[type=file] >> nth=2',P+"/2f50f8e8-1b36-4f47-a60d-5ab0bd093bc8.jpg"); pg.wait_for_timeout(7000)
    pg.click('button:has-text("Register pet")'); pg.wait_for_function("()=>!location.pathname.endsWith('/new')",timeout=60000); pg.wait_for_timeout(2500); print('pet ok', pg.url[-14:])
    # dangerous report
    pg.goto(B+"/report/situation"); pg.wait_for_timeout(1200); pg.click('text=It may be dangerous'); pg.wait_for_timeout(1500)
    pg.set_input_files('input[type=file] >> nth=3',P+"/696cb5f5-19ac-4c06-b0a6-ef52df58dcd7.jpg"); pg.wait_for_timeout(8000)
    pg.click('label:has-text("Dog")'); pg.fill('input[placeholder*="Type a colour"]','Black'); pg.keyboard.press('Enter'); pg.keyboard.type('Tan'); pg.keyboard.press('Enter')
    pg.fill('input[placeholder*="Aspin"]','German Shepherd')
    pg.locator('text=Chasing or attacking people').click(force=True); pg.locator('text=Attempted bite or attack').click(force=True)
    pg.locator('input[type=radio][value="Yes, currently aggressive"]').check(force=True); pg.locator('input[type=radio][value="Yes"]').last.check(force=True)
    pg.fill('[placeholder*="black collar"]','Large, no collar')
    pg.fill('[placeholder*="without a leash"]','Large black and tan dog chasing joggers and trying to bite near the park entrance in the morning.')
    pg.fill('input[type=datetime-local]','2026-11-20T07:15'); pg.click('button:has-text("Continue")'); pg.wait_for_timeout(2000)
    location(pg,'Selera Homes Main Entrance Gate'); submit(pg)
    # found report
    pg.goto(B+"/report/situation"); pg.wait_for_timeout(1200); pg.click('text=It looks lost or has no owner nearby'); pg.wait_for_timeout(1500)
    pg.set_input_files('input[type=file] >> nth=2',P+"/3b4c2b14-1bcf-4892-bbbd-b80e034b6238.jpg"); pg.wait_for_timeout(8000)
    pg.click('label:has-text("Dog")'); pg.fill('input[placeholder*="Type a colour"]','Cream'); pg.keyboard.press('Enter')
    pg.fill('input[placeholder*="Aspin"]','Labrador Retriever')
    pg.fill('textarea','Friendly cream-coloured dog with a brown collar, wandering near the playground. Looks well cared for.')
    pg.fill('input[type=datetime-local]','2026-11-20T08:00'); pg.select_option('select','Where I found it')
    pg.click('button:has-text("Continue")'); pg.wait_for_timeout(2000)
    location(pg,'Selera Community Park & Clubhouse'); submit(pg)
    b.close()
