# Multi-Animal Reports — Plan (Option C: split into per-animal records)

> **Status:** **implemented** (2026-10-20). Backend: `app/routes/report_split.py`, `app/utils/report_split.py`.
> Frontend: `AnimalRecordsPanel`, `PhotoCropper`, `ReplaceAnimalPhotoButton`. Tests: `backend/tests/test_multi_animal_split.py`.
> Decisions from the team are in section 7. Photo replacement: Subdivision Leader (own subdivision) and Barangay Staff
> (own barangay). Max 10 animals per split; larger groups are added in further batches to the same group report.
> **Schema change (approved):** one new column, `reports.split_from_report_id`.

## 1. Problem

A resident can submit one report for several animals (the AI warns, but **Animal Count = 3** is still accepted). The
**Roaming** category is meant for groups. After that, though, everything assumes **one animal per report**:

| Area                  | What breaks with a 3-dog report                                         |
| --------------------- | ----------------------------------------------------------------------- |
| Holding facility      | Only one dog can be taken in (`holding_animals.report_id` is unique)  |
| AI matching           | The report is compared as one animal (one photo, one colour/breed)      |
| Pet confirmation      | Only one pet can ever be confirmed per case (`pet_conflict_for_case`) |
| Claims / returns      | One claim closes the whole report, even if two dogs are still held      |
| Pet history, adoption | Only one animal ever gets records                                       |

## 2. Goal

The group report stays as **the incident** (who reported it, where and when). The Subdivision Leader **adds one record
per animal**, cropping each dog out of the group photo. Each animal then gets its own matching, holding record, claim or
adoption, and history. When the animal is taken into holding, its photo can be **replaced with a clear close-up** for
better matching.

## 3. How it works

### 3.1 Add animal records (split)

1. On a report, the **Subdivision Leader** clicks **"Add records per animal"**. It is shown when `animal_count > 1`,
   and also available on any report in the leader's subdivision, since the count may be wrong.
2. The form shows one card per animal; the number starts at the reported count and can be changed (minimum 2). For each
   animal the leader enters:
   - **Photo.** Pick one of the report's photos and **crop the animal out of it** (see 3.2), or upload a new photo.
   - **Type, main colour, size, sex** (pre-filled from the report; edit per animal).
   - **Notes** (for example "black, torn left ear").
3. **Carry over.** If the group report already has a holding record, a confirmed pet or an open claim, the leader picks
   which animal it belongs to.
4. On save, the system creates **one child report per animal**:
   - Copied from the group: reporter, subdivision, category, location and landmark, visibility and current status.
   - Set per animal: `animal_count = 1`, the animal's details, its cropped photo, and
     **`split_from_report_id = <group report>`**.
   - Description: "Animal 2 of 3 from Report #45".
5. **Timeline entries:** "Split into Reports #51, #52, #53" on the group, and "Split from Report #45" on each child.
   An audit-log entry records who did it.
6. **AI matching runs per animal.** A follow-up AI job is queued for each child report (existing `enqueue_follow_up`),
   using that animal's own cropped photo and description.
7. **Notify the reporter:** "Your report of 3 animals is now tracked as 3 animal records."

**When:** allowed **before the rescue** (from the sighting photo, so matching and owner search can start early) and
**at intake** (when the animals are in hand and easier to tell apart).

### 3.2 Crop the photo

- A crop box is drawn over the selected photo: drag to select the animal, then resize. It uses a plain canvas, with **no
  new library**.
- The cropped area is saved as a **new image** through the existing direct Cloudinary upload (`uploadDirectToCloudinary`).
  The **original group photo is never changed** and stays on the group report as evidence.
- The cropped image is checked by the same AI photo check as normal uploads (dog or cat detected). This also catches a
  crop that missed the animal.

### 3.3 Replace the photo at intake

- When an animal record is taken into holding (or at any time while it is held), the leader or barangay staff can click
  **"Replace photo with a close-up"** and upload a clearer picture taken at the facility. That photo can be cropped too.
- The new photo becomes the animal's **main photo**. The old (cropped) photo is **kept** in the report's media and
  timeline as "earlier photo", not deleted.
- Replacing the photo **re-runs AI matching** for that animal, since a clearer photo can find its owner.

### 3.4 After the split

- **Each child is a normal report:** holding intake, matching, owner verification, claim and return, and adoption all
  work exactly as today.
- **The group report steps aside.** It no longer takes part in matching (its open suggestions are marked as covered by
  the split) and cannot be merged. Its page lists the animal records and their status.
- **The group report is resolved automatically** when all its child reports are closed.

## 4. Rules

- **Who can split:** **Subdivision Leader only**, for reports in their own subdivision.
- **Who can replace a photo at intake:** Subdivision Leader and Barangay Staff (both handle held animals).
- **Limits:**
  - A child report cannot be split again.
  - At least 2 animals per split.
  - Up to 10 animals per split (a guard against mistakes).
- **Undo split:** allowed only while no child has its own holding record, claim or confirmed match. Undoing restores
  the group report and archives the empty children. History is never deleted.
- **One case, one pet** stays as it is. It is now satisfied naturally, because each animal is its own case.
- **The resident's report form is unchanged.** The current multi-animal warning stays as it is.

## 5. What changes where

| Part     | Change                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database | `reports.split_from_report_id INT NULL`, FK → `reports.report_id`, ON DELETE SET NULL, indexed. Added to the model, the start-up migration in `main.py`, and `Database3.3.txt` |
| Backend  | `POST /reports/{id}/split` (animals list, cropped photo links, carry-over choices; leader only)                                                                                       |
| Backend  | `GET /reports/{id}/split-group` (group and child records with status)                                                                                                                 |
| Backend  | `POST /reports/{id}/unsplit` (leader; only while the children are empty)                                                                                                              |
| Backend  | `POST /reports/{id}/replace-photo` (leader or staff; keeps the old photo; re-queues AI matching)                                                                                      |
| Backend  | Group auto-resolve when the last child closes; group excluded from AI matching and merging once split                                                                                   |
| Frontend | **"Add records per animal"** form with the crop tool on the Subdivision report view (`SubdViewReport`)                                                                          |
| Frontend | **"Replace photo with a close-up"** on the Subdivision and Barangay holding pages                                                                                                 |
| Frontend | The group report lists its animal records; each child shows "Animal 2 of 3 from Report #45" (leader, staff and the reporter's view)                                                     |
| Docs     | ERD 04A: new self-relationship `reports.split_from_report_id → reports` (one group, many animal records). DFD 3.0 / 6.0 text: one sentence on splitting                              |

## 6. Tests

- A 3-dog report split into 3 children: details, cropped photos, `split_from_report_id` and timeline entries are correct.
- Only the leader of that subdivision can split. Residents, staff and other leaders get 403.
- Splitting works both before the rescue and after intake.
- Each child can get its own holding record, so the unique-per-report rule is no longer a blocker.
- Two children are confirmed to two **different** owners' pets, so the "one case, one pet" block no longer stops it.
- A claim on one child closes only that child. The group closes after the last child.
- Carry-over: an existing holding record, confirmed pet or claim moves to the chosen child.
- Replacing a photo keeps the old one, sets the new main photo, and queues a new AI match.
- A crop with no dog or cat in it is rejected by the photo check.
- The group is excluded from matching and merging after the split. Undo is refused once a child has activity.
- Migration: the new column is added on start-up, and existing reports keep NULL.

## 7. Decisions (from the team)

| # | Question                           | Decision                                                                                                                                        |
| - | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Who can split?                     | **Subdivision Leader** (own subdivision only)                                                                                             |
| 2 | When?                              | **Before the rescue and at intake**                                                                                                       |
| 3 | How to store the group link?       | **New database column** `reports.split_from_report_id`                                                                                  |
| 4 | Change the resident's report form? | **No.** Keep the current warning                                                                                                          |
| 5 | Per-animal photos                  | Leader **crops each animal from the group photo** when adding records; leader or staff can **replace it with a close-up at intake** |

**Confirmed by the team (2026-10-20):**

- **Photo replacement:** Subdivision Leader (own subdivision) and Barangay Staff (own barangay).
- **Maximum animals per split:** 10. Larger groups are added in further batches to the same group report.

## 8. Checklist

### 8.1 Done — multi-animal reports

- [X] Database: `reports.split_from_report_id` (FK → reports, ON DELETE SET NULL), start-up migration, `Database3.3.txt`
- [X] Split endpoint: leader of the subdivision only, 2–10 animals per batch, more in later batches (up to 50)
- [X] Split is atomic: the group row is locked and the same `client_token` returns the first result (no duplicate records)
- [X] Carry-over: an existing holding record, confirmed pet or open claims move to the animal the leader chooses
- [X] Group report steps aside: no AI matching, no merging, open AI suggestions closed as superseded
- [X] Group report resolves automatically when all its animal records are closed
- [X] Undo split (only while the animal records have no holding record, claim, confirmed pet or return); nothing deleted
- [X] Replace an animal's photo with a close-up: leader (own subdivision) or staff (own barangay); old photo kept as evidence
- [X] AI matching re-runs after a photo is replaced, including for animals already in holding
- [X] Matching uses the report's main photo before evidence photos
- [X] Crop tool (canvas, no new library), with the AI check: one dog or cat per crop
- [X] "It's one animal, use this photo anyway" override when the AI miscounts
- [X] Split form: type, sex, main colour (type to search), breed (type to search; TheDogAPI / TheCatAPI), size, notes
- [X] Save-button hint explains what is still missing
- [X] Panels on the leader, barangay and resident report views; animal records link to their group and back
- [X] Dashboards count incidents only (admin, leader, barangay); admin API also returns `animal_records_count`
- [X] Leader's report list: one card per incident, animals shown inside the group card
- [X] Resident home feed: one card per incident, "N animal records" badge
- [X] ERD 04A and the complete ERD updated (147 foreign keys); manuscript sentence added
- [X] Tests: `backend/tests/test_multi_animal_split.py` (53 checks); full backend suite passes

### 8.2 Done — pet registration with a multi-animal photo

- [X] Resident (My Pets) and Leader / Admin (Pet Records): the main photo is checked for how many animals it shows
- [X] Warning and "Crop this pet" (same crop tool); the crop is checked again before saving
- [X] One animal per pet record: registration is blocked until the photo is cropped or confirmed
- [X] Override with a required reason (5–300 characters), validated by the server and written to the audit log
- [X] "Register another animal from this photo": same photo kept in memory, owner kept, new pet details blank
- [X] The shared photo is logged (`PET_REGISTERED_FROM_SHARED_PHOTO`); front / left / right photos unchanged
- [X] Barangay Staff: warning, crop and override work when creating a pet from a report (existing rule: staff
  can't add pets from Pet Records)
- [X] Tests: `backend/tests/test_pet_photo_multi_animal.py` (21 checks)

### 8.3 To do — correctness

- [X] **Status sync:** until an animal has its own holding record, status updates on the group (rescue en route,
  picked up, impounded) also apply to its animal records. Done 2026-10-20: rescue-stage statuses (2, 4, 5, 6, 7, 8,
  13, 16), custody and facility follow the group; closing statuses never spread. A group reaching the facility
  gives each animal its own holding record, and a group report can't be taken into holding directly.
  Tests: 11 more checks in `test_multi_animal_split.py` (64 in total)
- [X] **Visibility sync:** changing the group's Public / Private setting updates its animal records. Done 2026-10-20:
  the whole decision (visibility, who, when, why) follows the group; verification that makes a report count as
  checked is copied too, a false-alarm verdict never is. Tests: 7 more checks (71 in total)
- [X] **Reporter notifications:** combine updates for animal records of the same group into one notification
  (first confirm which events notify the reporter)
- [X] **Reported vs recorded count:** show "2 of 3 reported animals recorded" on the group, with "Add more animals"
  or a short reason (e.g. only 2 found on site)

### 8.4 To do — consistency

- [X] Barangay report and rescue-request lists and the Admin report list: one card per incident (as on the leader's
  list and the resident home)
- [X] Group timeline: short entries when each animal's case ends ("Animal 2 returned to owner", "Animal 3 adopted")
- [X] Holding page: show "Animal 2 of 3 from Report #101" next to the animal's photo

### 8.5 To do — UX

- [X] Undo split: replace the browser `confirm()` with the standard Cancel / Yes modal
- [X] Crop tool: corner handles to resize the box; bigger crop area on phones
- [X] Decide the priority shown on animal records: the group's priority or the animal's own AI suggestion

### 8.6 To do — admin oversight

- [X] Admin Logs: a filter for `PET_PHOTO_OVERRIDE`, `PET_REGISTERED_FROM_SHARED_PHOTO`, `REPORT_SPLIT` and
  `ANIMAL_PHOTO_REPLACED`
- [X] Admin dashboard: a card for `animal_records_count`

### 8.7 Before the defence

- [ ] Restart the backend and the AI worker (`python -m app.ai_worker`) so both run the new code
- [ ] End-to-end run in the browser: split Report #101, crop both dogs, take one into holding, replace its photo,
  let an owner claim the other, check the group report closes
- [ ] End-to-end run: register two pets from one photo (resident and leader), including one override
- [ ] DFD text (process 3.0) and manuscript: one sentence on splitting a multi-animal report
