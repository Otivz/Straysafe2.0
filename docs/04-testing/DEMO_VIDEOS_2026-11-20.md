# Demonstration videos for respondents (Resident and Subdivision Leader)

Status: Current (produced and checked 2026-11-20 against the local development build; see Limitations)

Two narrated walkthroughs of the application as it is implemented, made for the evaluation respondents: one for Residents, one for Subdivision Leaders. Both show the real application running, not mock-ups.

| Video | File | Length | Format |
|---|---|---|---|
| STRAYSAFE 2.0: Resident User Demonstration | `STRAYSAFE_Resident_Demonstration.mp4` | 5:23 | 1920 x 1080, 30 fps, H.264 + AAC |
| STRAYSAFE 2.0: Subdivision Leader User Demonstration | `STRAYSAFE_Subdivision_Leader_Demonstration.mp4` | 5:27 | 1920 x 1080, 30 fps, H.264 + AAC |

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
| Introduction (title card, branding) | 0:00 to 0:18 |
| Sign in | 0:18 to 0:40 |
| Dashboard | 0:40 to 1:05 |
| Features tour | 1:05 to 1:59 |
| Reporting workflow | 1:59 to 3:56 |
| Pets and QR tags | 3:56 to 4:49 |
| Notifications and settings | 4:49 to 5:06 |
| Closing (summary, branding) | 5:06 to 5:23 |

### Resident script and narration (time = start of the line)

| Time | Cue | Narration |
|---|---|---|
| 0:01 | Title card | Welcome to StraySafe 2.0, the stray animal reporting and management system for our subdivision. This demonstration is for residents. You will see how a resident signs in, reports an animal, registers a pet, and follows what happens next. |
| 0:22 | r1 | Residents begin at the welcome screen. A resident who already has an account taps Sign in, then enters their email and password. New residents can create an account from here. |
| 0:40 | r2 | After signing in, the resident lands on Home. It greets the resident by name and shows the subdivision. Three shortcuts are at the top: report a lost pet, report a found animal, and open My pets. |
| 0:53 | r3 | Your reports lists everything the resident has submitted. Recent conversations lets the resident message the subdivision office, and In your community shows the Leader's latest notices. |
| 1:05 | r4 | The Community tab shows the notices that the subdivision Leader has chosen to publish: lost pets, found animals, and advisories. A resident can also search by name, breed or colour. |
| 1:17 | r5 | Opening a found animal notice shows the animal's photo and a general area on the map, never the exact spot and never who reported it. A resident can say This may be my animal, which starts a claim that the subdivision reviews, or I saw this animal too. |
| 1:35 | r6 | Residents can also scan a pet's QR tag. The phone's own camera opens the tag's page, where a finder can tell the owner where the pet is. The owner's name, address and phone number are never shown. |
| 1:48 | r7 | The Profile tab keeps the resident's account: pets, notifications, warnings and notices, settings, privacy, help, and the office contact details. |
| 1:59 | r8 | To report an animal, the resident taps Report. There are three choices: report a lost pet, make an animal complaint, or report an animal that may need attention. A reminder says this is not for emergencies. |
| 2:12 | r9 | In this example, the resident reports an animal that looks lost. First, the resident chooses what is happening with the animal. |
| 2:22 | r10 | Step one is about the animal. A clear photo is required. The resident chooses the kind of animal, adds its colours and breed, describes it, and says when it was found and where it is now. |
| 2:51 | r11 | Step two is the location. The resident picks a landmark, uses their current location, or taps the map. The pin must be inside the subdivision's reporting area, and neighbours only see a general area, never the exact pin. |
| 3:05 | r12 | Step three is a review. The resident checks every detail and can change any of them. The screen reminds the resident that an administrator reviews the report before any notice is shared, and that until then it stays private. Then the resident submits it. |
| 3:30 | r13 | The report is saved with a reference number and goes to the subdivision for review. Nothing is shared with neighbours until an administrator has checked it, and the resident sees each change of status in the app. |
| 3:40 | r14 | The resident can open the report to follow it, and finds every report under My reports. |
| 3:56 | r15 | Next, pets. From the Profile, the resident opens My pets and registers a pet with its name, kind, colours, a photo and other details. A registration is what the resident declares. It is not proof of ownership. |
| 4:40 | r16 | Each registered pet gets its own QR tag. Anyone who scans it sees only the pet, never the owner. The resident can print the tag, request a QR collar from the subdivision office, or report the pet as lost with one tap. |
| 4:54 | r17 | Notifications keep the resident informed, and Settings lets them choose which updates they receive, inside the app or by email. |
| 5:06 | Closing card | That is StraySafe for residents. A resident can report an animal, follow the report, register pets with a QR tag, and read notices from the subdivision. Thank you for watching. Please continue to the evaluation questionnaire. |

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
| Introduction (title card, branding) | 0:00 to 0:18 |
| Sign in | 0:18 to 0:48 |
| Dashboard | 0:48 to 1:18 |
| Report management | 1:18 to 2:30 |
| Verification and management | 2:30 to 4:14 |
| Other management modules | 4:14 to 5:09 |
| Closing (summary, branding) | 5:09 to 5:27 |

### Leader script and narration (time = start of the line)

| Time | Cue | Narration |
|---|---|---|
| 0:01 | Title card | Welcome to StraySafe 2.0. This demonstration is for Subdivision Leaders, HOA officers and other authorized personnel. You will see how a Leader reviews resident reports, verifies them, publishes notices, and manages cases for the subdivision. |
| 0:22 | l1 | The Leader signs in on the administration page with a Leader account. |
| 0:48 | l2 | The dashboard summarizes the day: new reports, active cases, urgent cases, and follow-ups that are due. Below are the items that need attention, the missing and found animals being monitored, upcoming follow-ups, and recent activity. |
| 1:04 | l3 | The bell shows notifications, such as new reports from residents. |
| 1:18 | l4 | Cases lists every report from the subdivision. The Leader can switch between Active, Closed and All cases, search, and filter by category. |
| 1:41 | l5 | Here is a found animal report from a resident. The Leader sees the photo, the description, who reported it and where, and can show the location on the map. |
| 2:05 | l6 | To help the owner find the animal, the Leader can publish a community notice. The preview shows exactly what residents will see. The finder's own words stay private, and the notice never includes phone numbers or exact addresses. |
| 2:19 | l7 | Once published, residents are notified once, and the notice appears in Community under Found animals. |
| 2:30 | l8 | Reports about a dangerous animal, an injured animal or a complaint are private and work differently. This one was marked Urgent automatically because an attempted bite was reported. The Leader begins with Start review. |
| 2:51 | l9 | On the Assessment tab, the Leader records whether the incident is verified, partly verified, could not be verified, or invalid, and must write what the decision is based on. A safety risk assessment can be recorded too, such as the severity of the behavior. |
| 3:20 | l10 | After saving, the case shows the incident as Verified. The main button moves the case through its status: Mark in progress, and later Close case. |
| 3:36 | l11 | The more actions menu offers Create Referral, Change status, Change priority, Add internal note, and Create community notice. A referral records a request for outside help, such as the Barangay or the Veterinary Office, and its updates. The subdivision keeps control of closing the case. |
| 3:54 | l12 | The Actions tab lists response actions, such as recording a follow-up, issuing a warning to a confirmed owner, or publishing a safety advisory. The History tab records every update, with who made it and when. |
| 4:14 | l13 | The Community page lists the notices published to residents. The Leader can create new notices and keep drafts and archived notices. |
| 4:23 | l14 | The Pet Registry lists the pets that residents registered, with a tab for QR collar requests. A registration is declared by the owner and is not proof of ownership. |
| 4:33 | l15 | Residents lists the people in the subdivision with their contact details and pets. These details are visible to administrators only. |
| 4:41 | l16 | Analytics shows, for a chosen period, how many reports were received and how many cases were closed, the most reported categories, and how cases ended. |
| 4:52 | l17 | Messages holds conversations with residents, and Warning Templates holds the letters used for official warnings. |
| 5:09 | Closing card | That is StraySafe for Subdivision Leaders. The Leader reviews reports, verifies incidents, publishes notices, coordinates referrals, and keeps a full history of every case. Thank you for watching. Please continue to the evaluation questionnaire. |

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
