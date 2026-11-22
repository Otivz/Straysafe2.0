import json, os, wave
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"C:\Users\user\Straysafe2.0\docs\04-testing\DEMO_VIDEOS_2026-11-20.md"

def dur(p):
    w = wave.open(p); d = w.getnframes() / w.getframerate(); w.close(); return d
def mmss(t): t = int(round(t)); return f"{t//60}:{t%60:02d}"

def load(role):
    cfg = json.load(open(os.path.join(HERE, f'cfg_{role}.json'), encoding='utf8'))
    tl = json.load(open(cfg['timeline'], encoding='utf8'))
    ti = dur(cfg['intro_wav']) + 2.6; to = dur(cfg['outro_wav']) + 3.0
    return cfg, tl, ti, to

def scenes_table(cfg, tl, ti, labels):
    rows = []
    sc = tl['scenes']
    for i, (t, key) in enumerate(sc):
        end = sc[i + 1][0] if i + 1 < len(sc) else tl['duration']
        rows.append(f"| {labels.get(key, key)} | {mmss(ti + t)} to {mmss(ti + end)} |")
    return "\n".join(rows)

def script(cfg, tl, ti, to, intro_text, outro_text):
    out = [f"| {mmss(0.8)} | Title card | {intro_text} |"]
    for ln in tl['lines']:
        out.append(f"| {mmss(ti + ln['t'])} | {ln['key']} | {ln['text']} |")
    out.append(f"| {mmss(ti + tl['duration'] + 0.6)} | Closing card | {outro_text} |")
    return "\n".join(out)

import importlib.util
def narr(path):
    src = open(path, encoding='utf8').read()
    s = src.index('N = {'); e = src.index('\n}\n', s) + 3
    ns = {}; exec(src[s:e], ns); return ns['N']
NR = narr(os.path.join(HERE, 'rec_resident.py')); NL = narr(os.path.join(HERE, 'rec_leader.py'))
rc, rt, rti, rto = load('resident'); lc, lt, lti, lto = load('leader')
rtot = rti + rt['duration'] + rto; ltot = lti + lt['duration'] + lto
rlabels = {'login': 'Sign in', 'home': 'Dashboard', 'features': 'Features tour', 'report': 'Reporting workflow', 'pets': 'Pets and QR tags', 'settings': 'Notifications and settings'}
llabels = {'login': 'Sign in', 'dashboard': 'Dashboard', 'reports': 'Report management', 'verify': 'Verification and management', 'more': 'Other management modules'}

md = f"""# Demonstration videos for respondents (Resident and Subdivision Leader)

Status: Current (produced and checked 2026-11-20 against the local development build; see Limitations)

Two narrated walkthroughs of the application as it is implemented, made for the evaluation respondents: one for Residents, one for Subdivision Leaders. Both show the real application running, not mock-ups.

| Video | File | Length | Format |
|---|---|---|---|
| STRAYSAFE: Resident User Demonstration | `STRAYSAFE_Resident_Demonstration.mp4` | {mmss(rtot)} | 1920 x 1080, 30 fps, H.264 + AAC |
| STRAYSAFE: Subdivision Leader User Demonstration | `STRAYSAFE_Subdivision_Leader_Demonstration.mp4` | {mmss(ltot)} | 1920 x 1080, 30 fps, H.264 + AAC |

The MP4 files are large binaries and are kept out of version control (local folder `scratch/demo-videos/`).

## How they were made

- **Real application, separate demo data.** The footage was recorded from the running web application against a separate local database (`straysafe_demo`), a second API instance (port 8100) and a second Vite instance (port 5180). The development database `straysafe_subdivision` was not touched and none of its accounts, names or e-mail addresses appear.
- **Demonstration accounts only.** One Subdivision Leader and two Residents with `@straysafe.demo` addresses and invented names. The password is typed on screen but the field hides it.
- **Real interactions.** Every click, keystroke, upload and submission in the videos was performed in the application by a scripted browser with a visible cursor. Nothing on screen was edited, mocked or composited into the application window. Only the frame around it (title cards, scene tracker, captions, phone frame) was added afterwards.
- **Sample photos** were supplied by the project team (`scratch/demo-photos/`). They were uploaded through the application to its configured Cloudinary account.
- **Narration** is an offline Windows text-to-speech voice (Microsoft Zira), with a quiet synthesized background track. The voice is intelligible but not human.
- **Setup before filming (not shown, done through the same screens):** the second Resident had registered a pet, filed a dangerous-animal report and a found-animal report; the Leader had published the found-dog notice so the Community tab has content. For the Leader video, the first Resident also registered a pet and filed the found-cat report that the Leader then handles.

## Feature inventory (verified against the source)

| Area | Resident | Subdivision Leader | Shared |
|---|---|---|---|
| Sign-in | Welcome, sign in, create account (`frontend/src/resident/ResidentApp.tsx:84-87`) | Administration sign-in (`frontend/src/admin/AdminApp.tsx:52`) | Role-based access |
| Home / dashboard | Home with shortcuts, own reports, conversations, latest notices | Dashboard: new reports, active and urgent cases, follow-ups, attention list, recent activity (`DashboardPage.tsx`) | |
| Reports | Report an animal (found/stray, hurt, dangerous), animal complaint, lost pet; photo, location, review, submit; My reports; report details | Cases list with Active/Closed/All, search, category filter; found-animal ("monitored") case; incident case with Overview, Assessment, Actions and History tabs | Report reference numbers (SS-YYYY-NNNN) |
| Verification | none | Start review, verification decision with required basis, safety risk assessment, Mark in progress, Close case (`CaseDetailPage.tsx:85-86`, `AssessmentTab.tsx:351`) | |
| Notices | Community: lost pets, found animals, advisories; notice details; "This may be my animal"; "I saw this animal too" | Publish a Community notice with preview; Community page with Published, Drafts, Archived | Notices never show the reporter |
| Pets and QR | Register pet, QR tag, print/download tag, request QR collar, report pet lost, scan a pet tag | Pet Registry with QR Collar Requests tab | Registration is a declaration, not proof of ownership |
| Notifications | Notifications page, Settings toggles (in-app, e-mail), change password | Notification drawer from the bell | |
| Other | Profile, Help, Privacy, Contact, warnings and notices page | Residents, Analytics, Messages, Warning Templates, referrals (Create Referral), Settings | |

**Present in the code but not shown in either video** (no demonstration data, or not suitable for respondents): Complaint management and progressive enforcement (Leader), issuing warnings and letters, ownership-claim review, lost-pet notice flow and sightings, lost/found matching and duplicate review, case alerts, referral logging beyond the menu, live messaging threads, and the Leader's Settings page.

**Excluded because unavailable in the demonstration environment:** AI suggestions and look-alike matching (the AI worker and its Gemini calls were not running for the demonstration stack, so nothing AI-generated could be shown honestly).

**Retired or not part of the current system, so deliberately absent:** Barangay staff portal, rescue dispatch, holding place, adoption, claim fees ([system overview](../01-system/overview.md)). The Administrator role is reserved and not demonstrated.

## Video 1: Resident User Demonstration

Written for residents of the subdivision. Footage is the Resident web app in a phone-sized window.

### Resident scene breakdown

| Scene | Time in video |
|---|---|
| Introduction (title card, branding) | 0:00 to {mmss(rti)} |
{scenes_table(rc, rt, rti, rlabels)}
| Closing (summary, branding) | {mmss(rti + rt['duration'])} to {mmss(rtot)} |

### Resident script and narration (time = start of the line)

| Time | Cue | Narration |
|---|---|---|
{script(rc, rt, rti, rto, NR['intro'], NR['outro'])}

### Resident features demonstrated

1. Welcome screen, sign-in with e-mail and password, link to create an account.
2. Home: greeting, subdivision, three shortcuts, Your reports, Recent conversations, In your community.
3. Community: Lost pets / Found animals / Advisories tabs with counts, search box; found-animal notice with general-area map and the two actions (This may be my animal, I saw this animal too).
4. Scan a pet tag page; Profile menu (Edit profile, My pets, Notifications, Warnings and notices, Settings, Privacy, Help, Contact).
5. Report: the three choices and the not-for-emergencies reminder; "It looks lost or has no owner nearby"; animal details with required photo, kind, colours, breed, description, when, where now; location by landmark inside the reporting area with the pin check; review with "reviewed before sharing" notice; submit; confirmation with reference number; report details; My reports.
6. Pets: Register a pet (name, dog or cat, sex, breed, colours, age, marks, photo); pet page with permanent QR tag, View and print the tag, Download QR code, Request QR Collar, history sections, "is lost" button.
7. Notifications page and Settings toggles (updates on reports, sightings, lost and found alerts, ownership claim updates, safety advisories, notifications in the app, e-mail, change password).

## Video 2: Subdivision Leader User Demonstration

Written for Subdivision Leaders, HOA officers and authorized personnel. Footage is the Leader web app at desktop size.

### Leader scene breakdown

| Scene | Time in video |
|---|---|
| Introduction (title card, branding) | 0:00 to {mmss(lti)} |
{scenes_table(lc, lt, lti, llabels)}
| Closing (summary, branding) | {mmss(lti + lt['duration'])} to {mmss(ltot)} |

### Leader script and narration (time = start of the line)

| Time | Cue | Narration |
|---|---|---|
{script(lc, lt, lti, lto, NL['intro'], NL['outro'])}

### Leader features demonstrated

1. Leader sign-in.
2. Dashboard: four counters, Needs your attention, Missing and found animals, Upcoming follow-ups, Recent activity; notification drawer from the bell.
3. Cases: Active / Closed / All, search, category filter, case cards.
4. Found-animal case: photo, description, reporter, location, Show on the map, status strip (Linked reports, Community notice, Alerts, Barangay), Publish a Community notice dialog with preview and what happens next, confirmation toast.
5. Incident case (possibly dangerous animal): automatic Urgent priority, Start review, Assessment tab (Verified / Partly verified / Could not be verified / Invalid, required basis, safety risk assessment, Save assessment), Overview showing Incident: Verified, Mark in progress (then Close case), the more-actions menu (Create Referral, Change status, Change priority, Add internal note, Create community notice), Actions & follow-ups tab, History tab with every update.
6. Community (published notices, Drafts, Archived), Pet Registry and QR Collar Requests, Residents, Analytics, Messages, Warning Templates.

## Verification checklist

"Code" is the evidence that the feature exists in the source. "Seen" means it appears in the footage (checked from frames of the final video and from screenshots taken during recording).

| # | Feature shown | Code evidence | Seen |
|---|---|---|---|
| R1 | Welcome, sign in, create account | `frontend/src/resident/ResidentApp.tsx:84-87` | yes |
| R2 | Bottom navigation Home, Community, Report, My reports, Profile | `frontend/src/resident/components/Chrome.tsx:18-24` | yes |
| R3 | Community tabs and search, Scan a pet tag | `frontend/src/resident/pages/community/CommunityPage.tsx:74` | yes |
| R4 | Notice details, This may be my animal, I saw this animal too | `frontend/src/resident/pages/community/NoticePage.tsx:33,58` | yes |
| R5 | Report chooser with not-for-emergencies note | `frontend/src/resident/pages/report/CategoryPage.tsx:64` | yes |
| R6 | "It looks lost or has no owner nearby" | `frontend/src/resident/data/entries.ts:24` | yes |
| R7 | Review step, "Reviewed before sharing", submit for review | `frontend/src/resident/pages/report/ReviewPage.tsx:113,213` | yes |
| R8 | Pet registration, QR tag, View and print the tag, Request QR Collar | `frontend/src/resident/pages/pets/PetTagSection.tsx:161,272` | yes |
| R9 | Notifications and Settings (incl. Change password) | `frontend/src/resident/pages/account/SettingsPage.tsx:46` | yes |
| L1 | Leader sign-in at the administration address | `frontend/src/admin/AdminApp.tsx:52` | yes |
| L2 | Sidebar modules | `frontend/src/admin/layout/Sidebar.tsx:11` | yes |
| L3 | Notification drawer | `frontend/src/admin/layout/NotificationsDrawer.tsx:17` | yes |
| L4 | Cases Active / Closed / All | `frontend/src/admin/pages/CasesPage.tsx:253` | yes |
| L5 | Show on the map | `frontend/src/admin/pages/case/monitored/Hero.tsx:134` | yes |
| L6 | Publish a Community notice | `frontend/src/admin/dialogs/AlertDialogs.tsx:416` | yes |
| L7 | Start review, assessment, Mark in progress, Close case | `frontend/src/admin/pages/case/CaseDetailPage.tsx:85-86`, `AssessmentTab.tsx:351` | yes |
| L8 | More actions menu (referral, status, priority, note, notice) | `frontend/src/admin/pages/case/CaseDetailPage.tsx:109-113` | yes |
| L9 | Pet Registry and QR Collar Requests | `frontend/src/admin/pages/PetsPage.tsx:31` | yes |
| L10 | Analytics periods | `frontend/src/admin/pages/ReportsPage.tsx:14` | yes |
| L11 | Warning Templates | `frontend/src/admin/pages/WarningTemplatesPage.tsx:133` | yes |

## Limitations and findings

- **Offline voice.** The narration voice is synthetic. A human voice-over can be recorded over the same script if a more natural result is wanted.
- **No AI features.** AI suggestions and matching were not running for the demonstration, so they are not shown or mentioned.
- **Resident confirmation wording varies.** After submitting a found-animal report the confirmation screen sometimes reads "Awaiting review" and sometimes shows different wording and a "Private" tag, depending on the report's state at that moment (`ReviewPage.tsx` chooses between "Publish notice and submit" and "Submit for review"). The narration therefore says only what is true in both cases: the report goes to the subdivision for review and nothing is shared until an administrator has checked it.
- **Possible Pet Owners block not shown.** During testing, a found-animal case listed the reporter's own registered husky as a "Possible Owner Identified" for a German Shepherd report. That looked like a poor match, so the demonstration data avoids it and the videos do not show or describe that block. It is worth a separate look.
- **Bell badge overlap.** In the Leader app the red count badge sits over the centre of the notification bell and intercepts normal clicks (only the lower-left of the button opens the drawer).
- **`Database3.4_subdivision.sql` now seeds three real accounts** (it changed during this work, not as part of it). Review it before it is committed.
- **Photos uploaded to Cloudinary.** Test uploads from rehearsals and the final takes remain in the configured Cloudinary account under the application's normal folders; delete them there if they should not stay.
- **Length.** Both videos are slightly over the suggested range once title cards are included, because the narration describes each real step at a readable pace.

## Reproducing or re-rendering

The production scripts (recorder, compositor, narration scripts, seed scripts) are kept with the videos in `scratch/demo-videos/tools/`, outside version control. They need the demo stack described above, Playwright with Chromium, and ffmpeg. They contain the demonstration password, so do not commit them.
"""
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf8').write(md)
print('wrote', OUT, len(md))
