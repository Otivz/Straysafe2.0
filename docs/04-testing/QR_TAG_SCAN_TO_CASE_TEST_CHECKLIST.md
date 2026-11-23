# QR tag message moves the case: manual test checklist (phase 1)

Status: **Current** for phase 1 (2026-11-23). Plan: [QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md](../06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md). Automated checks for the same rules: `backend/tests/test_pet_tags_alerts.py` (the last 8 checks).

Use the local demo accounts in [DEMO_RESIDENT_CREDENTIALS.md](DEMO_RESIDENT_CREDENTIALS.md). Use three browser windows so the sessions do not mix: one **normal** (owner), one **private/incognito** (guest), one more **normal profile or another browser** (Leader and a second resident). Sign-in limit: 5 tries a minute.

## What you need before you start

- [ ] Backend and frontend running, with `FRONTEND_URL` (or `PUBLIC_TAG_BASE_URL`) set to the address you open in the browser
- [ ] A **resident** (the owner) with a **registered pet** (every pet has a permanent tag)
- [ ] A **Subdivision Leader** account of the same subdivision
- [ ] A **second resident** of the same subdivision (the neighbour)

## A. Set the scene

- [ ] A1. As the **owner**, file a **Lost pet** report for the registered pet (Report > Lost pet). The notice is published at once.
- [ ] A2. As the owner, open the pet's **QR tag** page and copy the tag link (`.../t/<token>`).
- [ ] A3. As the **Leader**, open the new case. Note the **status** in the header (a new case reads *Reported*). Open the **History** tab and count the lines.

## B. A guest sends a message

- [ ] B1. In the **private window** (not signed in), open the tag link. The public page shows the pet and **no owner details**.
- [ ] B2. Send a message: type a place ("Near the gate"), add a note, leave the phone box empty, and attach a **photo** (the form says only the owner and the Subdivision Leader see it).
- [ ] B3. As the owner: a notification **"Someone found <pet>"** arrives.
- [ ] B4. As the Leader, reload the case. **History** has one new line: *"A guest (not signed in) scanned the pet's QR tag and left a message for the owner."* It contains **no place, note or phone**.
- [ ] B5. The case status is **unchanged** (still *Reported*).
- [ ] B6. The message appears in the case's **QR tag messages** block, labelled as from a guest.

## C. A signed-in neighbour opens the tag

While the notice is **active**, a signed-in resident of the same subdivision does **not** get the message form.

- [ ] C1. As the **second resident**, open the tag link while signed in. The page says *Help bring (pet) home* with **I saw this pet** and **I have it safely with me**, and **no** "Where is the pet?" form.
- [ ] C2. Opening the page changes nothing on the case (status and History unchanged).
- [ ] C3. (Optional) Tap **I saw this pet** and send a sighting. That is the existing sighting flow, not this feature; the owner is told as before.
- [ ] C4. (Only to see the status lift) The form, and the move to **In progress**, appear for a signed-in person when the notice is still *requested* or the person is outside the subdivision. The backend tests cover this; it rarely happens in real use.

## D. Things that must not happen

- [ ] D1. **Community** shows the lost notice, but **no new sighting** appeared from any message.
- [ ] D2. The case was never **recovered or closed** by a message, and the pet is still **Lost**.
- [ ] D3. Send a guest message with "Share my number" ticked: the Leader's list shows "a number was shared" and **never the number** itself. Only the owner sees it.
- [ ] D4. Send a fourth message from the same visitor within the hour: the page says to try again later (3 per hour per visitor).

## E. Closed case and no notice

- [ ] E1. As the Leader, **close** the case (e.g. *No further sightings*, with a reason). Send a message from the guest window. It is accepted, the owner is notified, and **History gets no new line** and the case stays Closed.
- [ ] E2. Use a pet that has **no lost report**. Send a message. The owner is notified; **no case exists to change**.

## F. Phase 2: the Leader's Dashboard (backstop)

- [ ] F1. After a guest message (section B), reload the Leader's **Dashboard**. In **Missing and found animals**, the pet's row shows a **"1 tag message"** badge. Nothing new appears under **Needs your attention**.
- [ ] F2. Wait **1 hour** without the owner opening their pet's page (or ask a developer to use an older message). Reload: **Needs your attention** shows *"QR tag message (from a guest) not yet seen by the owner · sent ..."*.
- [ ] F3. As the owner, open the pet's page (its messages). Reload the Dashboard: the attention row is **gone**; the badge **stays** until the messages are resolved.
- [ ] F4. As the owner, mark the pet back home (or resolve the messages). Reload: the badge is gone.
- [ ] F5. The badge and the row never show the place, note or phone number.

## G. Phase 3: the owner answers

Use a guest message about the missing pet (section B), then sign in as the **owner** and open the notification (or *My pets* > the pet > the tag messages).

- [ ] G1. The message says **"A guest (not signed in)"**, and, with no phone, that the guest cannot be contacted through StraySafe.
- [ ] G2. There are two buttons, **Pet returned** and **Not my pet / fake**, and the note "Still looking? Leave it as it is: it stays here as Viewed". Opening the page made the message **Viewed**.
- [ ] G3. Leave a message as **Viewed**: the pet stays Lost, and the Leader sees "Viewed by the owner".
- [ ] G4. Tap **Not my pet / fake**: the message reads **Not the pet**; History says *"The owner said a QR tag message was not about their pet."*; nothing else changes.
- [ ] G5. Send another guest message, tap **Pet returned** and confirm. The case closes as *Missing pet recovered*, the pet is Active, and the open messages read **Pet returned**. The Leader sees "Pet returned" and "Not the pet" under *Earlier messages*.
- [ ] G6. For a pet that is **not** missing, a message shows **Mark as done** and **Not my pet / fake**.

## H. A stranger's photo

- [ ] H1. After B2 with a photo, the owner's message shows **"Tap to view · photo from a guest (not checked)"**, not the picture. One tap shows it.
- [ ] H2. The Leader's case shows **"Tap to view · photo from a visitor (not checked)"**.
- [ ] H3. The owner answers **This isn't real / not my pet**: the photo is no longer shown on the message.
- [ ] H4. A neighbour's photo (signed in) is shown directly, without the tap.

## Result

| Date | Tester | Sections passed | Notes |
|---|---|---|---|
| 2026-11-23 | Claude Code (scripted browser, throwaway database) | H1-H2 | 6/6, with the photo upload replaced by a fake link (nothing sent to Cloudinary). H3 covered by backend tests |
| 2026-11-23 | Claude Code (scripted browser, throwaway database) | G1-G5 | 14/14. G6 is covered by the page's code path, not this run |
| 2026-11-23 | Claude Code (scripted browser, throwaway database) | F1-F5 | 12/12. The 1-hour wait was simulated by making the message 90 minutes older in the throwaway database |
| 2026-11-23 | Claude Code (scripted browser, throwaway database) | B1-B6, C1-C2, D2 | 11/11. D1, D3, D4 and E are covered by backend tests, not this browser run. Not yet run by a person on the real app |
| | | | |
