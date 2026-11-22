import sys, traceback, common
from lib import Stage
B = common.B
N = {
'intro': "Welcome to StraySafe. This demonstration is for Subdivision Leaders, HOA officers and other authorized personnel. You will see how a Leader reviews resident reports, verifies them, publishes notices, and manages cases for the subdivision.",
'l1': "The Leader signs in on the administration page with a Leader account.",
'l2': "The dashboard summarizes the day: new reports, active cases, urgent cases, and follow-ups that are due. Below are the items that need attention, the missing and found animals being monitored, upcoming follow-ups, and recent activity.",
'l3': "The bell shows notifications, such as new reports from residents.",
'l4': "Cases lists every report from the subdivision. The Leader can switch between Active, Closed and All cases, search, and filter by category.",
'l5': "Here is a found animal report from a resident. The Leader sees the photo, the description, who reported it and where, and can show the location on the map.",
'l6': "To help the owner find the animal, the Leader can publish a community notice. The preview shows exactly what residents will see. The finder's own words stay private, and the notice never includes phone numbers or exact addresses.",
'l7': "Once published, residents are notified once, and the notice appears in Community under Found animals.",
'l8': "Reports about a dangerous animal, an injured animal or a complaint are private and work differently. This one was marked Urgent automatically because an attempted bite was reported. The Leader begins with Start review.",
'l9': "On the Assessment tab, the Leader records whether the incident is verified, partly verified, could not be verified, or invalid, and must write what the decision is based on. A safety risk assessment can be recorded too, such as the severity of the behavior.",
'l10': "After saving, the case shows the incident as Verified. The main button moves the case through its status: Mark in progress, and later Close case.",
'l11': "The more actions menu offers Create Referral, Change status, Change priority, Add internal note, and Create community notice. A referral records a request for outside help, such as the Barangay or the Veterinary Office, and its updates. The subdivision keeps control of closing the case.",
'l12': "The Actions tab lists response actions, such as recording a follow-up, issuing a warning to a confirmed owner, or publishing a safety advisory. The History tab records every update, with who made it and when.",
'l13': "The Community page lists the notices published to residents. The Leader can create new notices and keep drafts and archived notices.",
'l14': "The Pet Registry lists the pets that residents registered, with a tab for QR collar requests. A registration is declared by the owner and is not proof of ownership.",
'l15': "Residents lists the people in the subdivision with their contact details and pets. These details are visible to administrators only.",
'l16': "Analytics shows, for a chosen period, how many reports were received and how many cases were closed, the most reported categories, and how cases ended.",
'l17': "Messages holds conversations with residents, and Warning Templates holds the letters used for official warnings.",
'outro': "That is StraySafe for Subdivision Leaders. The Leader reviews reports, verifies incidents, publishes notices, coordinates referrals, and keeps a full history of every case. Thank you for watching. Please continue to the evaluation questionnaire.",
}
if __name__ == '__main__':
    S = Stage(N, {'width': 1440, 'height': 810}, 'leader', geo=False)
    pg = S.pg
    def step(name, fn):
        try: fn()
        except Exception as e:
            print('STEP FAILED', name, str(e)[:200].replace('\n', ' '), flush=True); S.snap('ld_fail_' + name)
    def side(label): S.click(f'aside a:has-text("{label}")', pause=2.2)
    def open_case(ref):
        try:
            S.click(pg.get_by_text(ref, exact=True).first, pause=2.5)
            pg.wait_for_url(f'**/cases/{ref}*', timeout=6000)
        except Exception:
            S.goto(B + f'/cases/{ref}', 2.5)
    def login():
        S.mark('login'); S.goto(B + '/login', 2.5)
        S.say('l1'); S.pause(1)
        S.type('input[type=email]', 'demo.leader@straysafe.demo'); S.type('input[type=password]', common.PW)
        S.click('button:has-text("Sign in")', pause=0.3); pg.wait_for_url('**/dashboard'); S.pause(3)
    def dashboard():
        S.mark('dashboard'); S.say('l2'); S.pause(5); S.snap('ld_dash'); S.scroll(260, pause=4); S.scroll(-260, pause=1)
        S.say('l3'); S.click('button[aria-label^="Notifications"]', pause=4.5, at=(9, 27)); S.snap('ld_bell'); pg.keyboard.press('Escape'); S.pause(1.2)
    def cases():
        S.mark('reports'); S.say('l4'); side('Cases'); S.snap('ld_cases')
        S.click('button:has-text("Closed")', pause=1.5); S.click('button:has-text("All")', pause=1.5); S.click('button:has-text("Active")', pause=1.5)
        S.type('input[placeholder^="Search cases"]', 'dog', delay=80, pause=1.8); pg.fill('input[placeholder^="Search cases"]', ''); S.pause(1)
    def found():
        S.say('l5'); open_case('SS-2026-0003'); S.snap('ld_found'); S.click('text=Show on the map', pause=3); S.scroll(240, pause=2); S.scroll(-240, pause=1)
        S.say('l6'); S.click(pg.get_by_role('button', name='Publish notice'), pause=2.5); S.snap('ld_publish'); S.pause(6)
        S.wait_say(); S.say('l7'); S.click(pg.get_by_role('button', name='Publish notice').last, pause=3.5); S.snap('ld_published'); S.pause(3)
    def incident():
        S.mark('verify'); S.say('l8'); side('Cases'); open_case('SS-2026-0001'); S.snap('ld_incident'); S.pause(2)
        S.click(pg.get_by_role('button', name='Start review'), pause=2.5)
    def assess():
        S.say('l9'); S.click(pg.get_by_role('tab', name='Assessment'), pause=2)
        S.click(pg.get_by_text('Verified', exact=True).first, pause=1.2)
        S.type('textarea[placeholder^="e.g. The guard"]', 'Photo shows the dog, and the resident describes the same chasing near the gate.', delay=30, pause=1)
        pg.locator('main select').nth(0).select_option('Moderate / threatening'); S.pause(.8)
        pg.locator('main select').nth(1).select_option('Attempted only'); S.pause(1.2); S.snap('ld_assess')
        S.click(pg.get_by_role('button', name='Save assessment'), pause=3)
    def progress():
        S.say('l10'); S.click(pg.get_by_role('tab', name='Overview'), pause=2.5); S.snap('ld_verified')
        S.click(pg.get_by_role('button', name='Mark in progress'), pause=3); S.snap('ld_inprog'); S.pause(1.5)
    def menu():
        S.say('l11'); S.click('button[aria-label="More case actions"]', pause=1.5); S.snap('ld_menu'); S.pause(7); pg.keyboard.press('Escape'); S.pause(1)
    def tabs():
        S.say('l12'); S.click(pg.get_by_role('tab', name='Actions & follow-ups'), pause=2.5); S.snap('ld_actions'); S.scroll(300, pause=3); S.scroll(-300, pause=.5)
        S.click(pg.get_by_role('tab', name='History'), pause=3); S.snap('ld_history')
    def more():
        S.mark('more'); S.say('l13'); side('Community'); S.snap('ld_comm'); S.pause(4)
        S.say('l14'); side('Pet Registry'); S.snap('ld_pets'); S.pause(2.5); S.click('text=QR Collar Requests', pause=2.5); S.snap('ld_qr')
        S.say('l15'); side('Residents'); S.snap('ld_res'); S.pause(3)
        S.say('l16'); side('Analytics'); S.snap('ld_an'); S.pause(3); S.scroll(380, pause=3); S.snap('ld_an2')
        S.say('l17'); side('Messages'); S.snap('ld_msg'); S.pause(3); side('Warning Templates'); S.snap('ld_wt'); S.pause(3)
        side('Dashboard')
    try:
        for n, f in [('login', login), ('dashboard', dashboard), ('cases', cases), ('found', found), ('incident', incident),
                     ('assess', assess), ('progress', progress), ('menu', menu), ('tabs', tabs), ('more', more)]:
            step(n, f)
    finally:
        S.finish()
