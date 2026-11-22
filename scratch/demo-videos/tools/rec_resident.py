import sys, common
from lib import Stage
B = common.B + "/resident-app"
P = "C:/Users/user/Straysafe2.0/scratch/demo-photos"
N = {
'intro': "Welcome to StraySafe, the stray animal reporting system for our subdivision. This demonstration is for residents. You will see how to sign in, report an animal, register a pet, and follow what happens next.",
'r1': "Residents start at the welcome screen. A resident with an account taps Sign in and enters their email and password. New residents can create an account here.",
'r2': "After signing in, the resident lands on Home, with a greeting and the subdivision name. Three shortcuts sit at the top: report a lost pet, report a found animal, and open My pets.",
'r3': "Below are the resident's own reports, recent conversations with the subdivision office, and the latest notices from the Leader.",
'r4': "The Community tab shows notices the Leader has published: lost pets, found animals, and advisories. Residents can search by name, breed or colour.",
'r5': "A found animal notice shows the photo and a general area on the map, never the exact spot and never who reported it. A resident can say This may be my animal, which starts a claim the subdivision reviews, or I saw this animal too.",
'r6': "Residents can also scan a pet's QR tag with the phone camera. A finder can tell the owner where the pet is, and the owner's details are never shown.",
'r7': "The Profile tab keeps the account: pets, notifications, warnings and notices, settings, privacy, help, and the office contact details.",
'r8': "To report an animal, the resident taps Report and chooses: a lost pet, an animal complaint, or an animal that may need attention. A reminder says this is not for emergencies.",
'r9': "Here, the resident reports an animal that looks lost.",
'r10': "Step one is the animal. A clear photo is required. The resident chooses the kind of animal, adds colours and breed, describes it, and says when it was found and where it is now.",
'r11': "Step two is the location. The resident picks a landmark, uses their current location, or taps the map. The pin must be inside the reporting area, and neighbours only see a general area.",
'r12': "Step three is a review. The resident checks every detail, and the screen reminds them that an administrator reviews the report before anything is shared. Then the resident submits it.",
'r13': "The report is saved with a reference number and goes to the subdivision for review. Nothing is shared with neighbours until an administrator has checked it.",
'r14': "The resident can open the report to follow it, and finds every report under My reports.",
'r15': "Next, pets. The resident registers a pet with its name, kind, colours and a photo. A registration is what the resident declares. It is not proof of ownership.",
'r16': "Each pet gets its own QR tag. A finder who scans it sees only the pet, never the owner. The resident can print the tag, request a QR collar from the office, or report the pet lost.",
'r17': "Notifications keep the resident informed, and Settings lets them choose which updates they receive, in the app or by email.",
'outro': "That is StraySafe for residents: report an animal, follow the report, register pets with a QR tag, and read notices from the subdivision. Thank you for watching. Please continue to the evaluation questionnaire.",
}
S = Stage(N, {'width': 450, 'height': 974}, 'resident')
pg = S.pg
try:
    S.mark('login')
    S.goto(B + "/welcome", 3); S.snap('rs_welcome')
    S.say('r1'); S.pause(1)
    S.click('a:has-text("Sign in"), button:has-text("Sign in")'); S.pause(1.5)
    S.type('input[placeholder*=example]', 'demo.resident@straysafe.demo'); S.type('input[type=password]', common.PW)
    S.click('button:has-text("Sign in")', pause=0.3); pg.wait_for_url('**/home'); S.pause(3)
    S.mark('home'); S.say('r2'); S.pause(2); S.snap('rs_home')
    S.say('r3'); S.scroll(420, pause=3); S.scroll(300, pause=1.5); S.scroll(-720, pause=.5)
    S.mark('features'); S.say('r4')
    S.click('nav a:has-text("Community")'); S.pause(2)
    S.click('button:has-text("Found animals")', pause=2); S.snap('rs_found')
    S.say('r5'); S.click('text=Labrador'); S.pause(3); S.snap('rs_notice'); S.scroll(380, pause=4); S.snap('rs_notice2'); S.scroll(300, pause=2)
    S.wait_say()
    S.click('button[aria-label="Back"]'); S.pause(1.5)
    S.say('r6'); S.click('text=Scan a pet tag'); S.pause(4)
    S.click('button[aria-label="Back"]'); S.pause(1)
    S.say('r7'); S.click('nav a:has-text("Profile")'); S.pause(3); S.snap('rs_profile'); S.scroll(250, pause=2.5)
    S.mark('report'); S.say('r8')
    S.click('nav a:has-text("Report")'); S.pause(5); S.snap('rs_report')
    S.say('r9'); S.click('text=Report an animal'); S.pause(3); S.snap('rs_sit')
    S.click('text=It looks lost or has no owner nearby'); S.pause(2)
    S.say('r10')
    S.upload('button:has-text("Choose from gallery")', P + '/images (4).jpg', pause=5)
    S.click('label:has-text("Cat")'); S.pause(.5)
    S.type('input[placeholder*="Type a colour"]', 'Brown'); pg.keyboard.press('Enter'); pg.keyboard.type('Black', delay=60); pg.keyboard.press('Enter'); S.pause(.5)
    S.type('input[placeholder*="Aspin"]', 'Tabby', pause=0.8)
    S.type('textarea', 'Small tabby kitten, very friendly, no collar. It was meowing near the playground.', delay=35)
    pg.fill('input[type=datetime-local]', '2026-11-20T09:30'); S.pause(.5)
    pg.select_option('select', 'Where I found it'); S.pause(1.5); S.snap('rs_details')
    S.click('button:has-text("Continue")', pause=2.5)
    S.say('r11'); S.click('text=Selera Community Park & Clubhouse', pause=2.5); S.pause(1); S.snap('rs_loc')
    S.click('button:has-text("Confirm location")', pause=3)
    S.say('r12'); S.scroll(500, pause=3); S.scroll(500, pause=2); S.snap('rs_review')
    S.click('button:has-text("Submit for review")', pause=0.3); pg.wait_for_url('**/submitted/**', timeout=90000); S.pause(2.5)
    S.say('r13'); S.snap('rs_submitted'); S.pause(5)
    S.say('r14'); S.click('text=View found animal details'); S.pause(4); S.snap('rs_repdet'); S.scroll(400,pause=2.5); S.scroll(-400,pause=.5)
    S.goto(B+'/reports',2.5); S.snap('rs_myreports')
    S.mark('pets'); S.say('r15')
    S.click('nav a:has-text("Profile")'); S.pause(1.5); S.click('text=My pets'); S.pause(2.5)
    S.click('a:has-text("Register a pet"), button:has-text("Register a pet")'); S.pause(2.5)
    S.type('input[placeholder=Mochi]', 'Bruno'); S.click('label:has-text("Dog")'); S.click('label:has-text("Male")', pause=.4)
    S.type('input[placeholder*="Shih"]', 'Siberian Husky')
    S.type('input[placeholder*="Type a colour"]', 'Black'); pg.keyboard.press('Enter'); pg.keyboard.type('White', delay=60); pg.keyboard.press('Enter')
    S.type('[placeholder="3 years"]', '3 years'); S.type('[placeholder*="Gold ear"]', 'Blue collar with a name tag')
    S.upload('button:has-text("Choose from gallery")', P + '/e72a54eb-2609-45dc-9435-84ffbbb115b4.jpg', pause=6); S.snap('rs_petform')
    S.click('button:has-text("Register pet")', pause=0.3); pg.wait_for_url('**/pets/*', timeout=90000); S.pause(3); S.snap('rs_pet')
    S.say('r16'); S.scroll(450, pause=3); S.snap('rs_pet_qr'); S.scroll(300, pause=3)
    S.mark('settings'); S.say('r17')
    S.goto_ready(B + "/notifications", 'text=Mark all as read', 1.5); S.snap('rs_notif'); S.pause(3)
    S.goto_ready(B + "/settings", 'text=Change password', 1.0); S.scroll(300, pause=2); S.snap('rs_settings')
    S.goto_ready(B + "/home", 'text=Your reports', 1.0)
except Exception as e:
    import traceback; traceback.print_exc(); S.snap('rs_error')
finally:
    S.finish()
