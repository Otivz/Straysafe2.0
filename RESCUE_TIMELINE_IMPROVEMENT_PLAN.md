# Rescue Timeline: Making It Easy for Residents (Revised Plan)

> **Status:** implemented (2026-10-15), Phases 0 to 5.
> - Care notes on a Public case: other residents see titles only (the plan's default; no other choice was made).
> - Phase 4 differs from the plan: the return record has no return-method column, so who confirmed a return comes
>   from who recorded it (a resident = "Confirmed by the owner", staff = "Handover checked by an officer"), sent as
>   `reunion_confirmed_by`.
> - Tests: `test_holding_privacy.py` (Phase 0), `test_reunion_confirmed_by.py` (Phase 4).
> **Revised:** 2026-10-15. Checked against the code and the live database; corrections from the first draft are in
> section 8.
> **Main files:** `RescueTimeline.tsx`, `utils/caseTimeline.ts`, `ResiViewReport.tsx`, `routes/holding.py`,
> `utils/report_visibility.py`

---

## 1. Goal

A resident opening a report should be able to answer three questions without reading every entry:

1. **Where is the case now?** (a stage stepper)
2. **Is the animal safe, and where is it?** (a one-line banner)
3. **What happened, in order?** (the existing timeline, with clearer cards)

At the same time, the timeline must not show residents anything the privacy rules keep for officials.

---

## 2. Phase 0: fix two privacy gaps first (required before Phases 1 to 5)

Both were found while checking the first draft. Each is a small server change with its own test.

### 0a. Holding facility records are open to everyone

**Found:** `GET /holding/` has no sign-in check. A request with no sign-in returned all 6 holding records, with
`medical_notes`, `intake_staff_name` and the full care `timeline`. A resident gets the same, including cases they are
not allowed to see. `GET /holding/{id}` has no sign-in check either.

**Who uses it:** staff holding pages and `useCaseHolding()` (Subdivision and Barangay report views), plus
`ResiViewReport.tsx`, which loads the whole list to find one record.

**Fix:**
- Require sign-in on every `/holding` read.
- Staff (roles 2, 3, 4) keep exactly what they get today.
- Residents no longer use the list. A new `GET /holding/by-report/{report_id}` returns the record only if the resident
  may view that report (the same `viewer_access()` rule as the report page; never for a match card or a hidden report),
  in a resident version:

| Field | Reporter / pet owner | Other residents (Public report) |
|---|---|---|
| Facility name, intake date, time in care, current status | Yes | Yes |
| Care log entries (admission, transfer, observation, discharge) | Title and notes | Title only |
| Staff names on log entries | Shown as a role ("Facility caretaker") | Shown as a role |
| `medical_notes`, `intake_staff_id` / name, kennel slot | No | No |
| Evidence photos | No | No |

- `ResiViewReport.tsx` switches to the new endpoint.

**Decision for you:** may other residents read the care notes text, or titles only (the table assumes titles only)?

**Tests:** signed out gets 401; a resident gets 404 for a report they can't see; the resident version has none of the
private fields; staff responses are unchanged.

### 0b. Evidence photos inside timeline entries are not filtered

**Found:** for residents who aren't the owner, `redact_response()` removes evidence photos (`is_evidence`) from the
report's own media, but not from the media attached to each history entry. Handover, reunion and dispute proof can
reach residents that way. 3 such photos are on Public reports now. In a read-only test none of them reached an outside
resident yet, but nothing in the code stops it.

**Fix:** apply the same `is_evidence` filter to `history[].media` for everyone except staff and the pet's owner.

**Tests:** an outside resident never receives an evidence photo through the history; the owner and staff still do.

---

## 3. The case stages (corrected)

Every status (18 in `report_status`) maps to one of five steps, shown at the top of the timeline. A case does not have
to pass every step: an animal found and returned at once skips "In safe care", and that step shows as *skipped*, not
done.

| Step | Statuses | Resident label |
|---|---|---|
| 1. Reported | 1 Reported | "Reported" |
| 2. Checked | 2 Verified, 16 Under Investigation, 15 Disputed | "Checked by the subdivision" |
| 3. Rescue | 4 Escalated to Barangay, 13 Approved, 5 Rescue In Progress, 6 Picked Up | "Rescue under way" |
| 4. In safe care | 7 Under Observation, 8 Impounded, or custody "In Subdivision / Barangay Facility" | "In safe care" |
| 5. Closed | see the outcomes below | depends on the outcome |

Step 5 has different endings, and only the first one is shown as a happy ending:

| Outcome | Statuses | Shown as |
|---|---|---|
| Good ending | 9 Claimed by Owner, 10 Released, 11 Incident Resolved, custody "Adopted" | green, "Back home", "Released" or "Adopted" |
| Sad ending | 12 Deceased | grey, "Passed away" |
| Not found | 17 Animal Cannot Be Found | grey, "Search ended" |
| Dismissed | 3 Rejected, 14 False Alarm / Dismissed | grey, "Closed: no action needed" (the report is hidden from other residents anyway) |
| Merged | 18 Merged: Duplicate | "Merged into Case #N"; the stepper follows the main case |

The dates under each step come from the first history entry that reached that step.

---

## 4. Improvements, in the order to build them

The timeline component is shared by 7 pages (resident, Subdivision, Barangay, admin and history views). Everything
below is added behind an `audience="resident"` option, so staff pages stay exactly as they are unless we decide
otherwise.

### Phase 1: stage stepper
- The five steps from section 3, with done / current / upcoming / skipped states.
- Tapping a step scrolls to its first entry.
- On phones (375 px) it becomes a compact "Step 3 of 5: Rescue under way" bar with a progress line.

### Phase 2: "where is the animal now" banner
- One sentence built from the current stage, `custody_status` and the facility name, for example:
  - "The animal is safe at the **Selera Homes Temporary Holding Pen** (in care for 2 days)."
  - "It was moved to the **Barangay San Vicente Animal Impound Facility**."
  - "A rescue team is on the way."
  - "Back home with its owner."
- Real facility names come from the data. None are written into the code.

### Phase 3: location chips
- History entries already carry `landmark`, `facility_name`, `latitude` and `longitude` (`StatusHistoryResponse`).
- Show a chip on entries that involve a place: "📍 Selera Community Park & Clubhouse".
- Tapping it centres the map below.

### Phase 4: reunion card
- Status 9 gets a highlighted card.
- The wording says who confirmed it, because they differ:
  - "Confirmed by the owner": the owner used **Confirm Pet Recovered & Safe** (`return_method = self_retrieved`).
  - "Handover checked by an officer": staff recorded the return with ID checks.
- The reunion photo is evidence (Phase 0b), so only the owner and staff see it. Other residents see the card without
  the photo.

### Phase 5: order toggle
- "Full story" (oldest first, today's order) and "Newest first".
- The choice is remembered per viewer in browser storage.

### Privacy note at the bottom of the timeline (accurate wording)
"Your name and contact details are hidden from other residents. Officials handling the case can see them, and a pet
owner's lost-pet contact is shown only if the owner published it."

---

## 5. Already done (not to rebuild)

- Plain-language titles and descriptions per event: REPORT CLAIMED, ESCALATED TO BARANGAY, REPORT UNMERGED, and others
  (`RescueTimeline.tsx`).
- Repeats of the same event within 3 minutes are merged into one card, with their photos kept.
- "Moved to holding facility" and "Facility relocation / transfer" within 5 minutes are merged.
- Holding care logs are already combined into the timeline (`buildCaseTimeline()`).
- Names of the reporter and the owner are replaced in the timeline text for other residents (`scrub()`, "Community
  Reporter", "Registered Owner").

---

## 6. Left out on purpose

- **Merging any events within 5 minutes:** it would hide separate status changes behind one card. Only repeats of the
  same kind of event are merged, as today.
- **"Photos only / Care only" filter pills:** not needed yet. Most cases have under 15 entries; revisit if long cases
  appear.
- **Responder GPS status:** live GPS tracking is deferred, so the timeline does not mention it.

---

## 7. What each viewer sees (matches the code)

| | Reporter | Pet's owner | Other residents (Public report) | AI look-alike owner | Staff |
|---|---|---|---|---|---|
| Timeline | Full, own name shown | Full | Yes, with names replaced | No timeline, only a match card | Full |
| Reporter's identity | Their own | "Community Reporter" | "Community Reporter" | Hidden | Real name and contact |
| Verification notes | Yes | Yes | **No** | No | Yes |
| Endorsement letter | Yes | Yes | **No** | No | Yes |
| Merged reports | Summary | Summary | **No** | No | Full |
| Owner-return record and photo | No | Yes | **No** | No | Yes |
| Evidence photos (claims, disputes, handover) | No | Own | **No** (after Phase 0b) | No | Yes |
| Holding care details | Phase 0a table | Phase 0a table | Phase 0a table | No | Full |
| Owner's lost-pet contact | Shown if the owner published it, on the owner's own lost-pet report while the pet is Lost | Own | Same | No | Yes |

---

## 8. Corrections from the first draft

| First draft said | Actually |
|---|---|
| Status 6 is "Animal Secured" | 6 is **Picked Up** |
| 4, 13 and 15 are still "Reported"; 3, 17 and 18 too | 4, 13 and 15 have moved past Reported; 3, 17 and 18 are closed (section 3) |
| 12 Deceased and 14 False Alarm are a "Happy Ending" | Separate, non-celebratory endings (section 3) |
| Other residents see verification notes, the endorsement letter, merged summaries and the reunion photo | They don't (section 7) |
| "Facility care logs: sanitized notes" for residents | Nothing was sanitized, and the data was open to anyone (Phase 0a) |
| "Verified Identity & Custody Handover" badge on every reunion | Only when an officer recorded it (Phase 4) |
| "Identities are permanently protected" | Officials see them, and published lost-pet contacts are shown (section 4) |
| Plain-language titles and grouping still to be built | Mostly built already (section 5) |
| Example places "San Lorenzo Holding Facility", "Pen #3", "Phase 2 Clubhouse" | Real ones: Selera Homes Temporary Holding Pen, Barangay San Vicente Animal Impound Facility, Selera Community Park & Clubhouse, Selera Homes Main Entrance Gate |
| `test_report_visibility.py` checks deduplication | It checks visibility; grouping gets its own check |
| Responder GPS status in the timeline | GPS tracking is deferred |

---

## 9. Checks before each phase is done

- **Phase 0:** new backend tests for 0a and 0b; the full backend suite still passes.
- **Phases 1 to 5:**
  - The stepper is checked for all 18 statuses, including the skipped step and each kind of ending.
  - Staff pages look exactly as before.
  - Phone width (375 px), light and dark mode.
  - Missing or broken photos don't break a card.
  - A resident session never shows evidence photos, private holding fields or real names of other residents.
