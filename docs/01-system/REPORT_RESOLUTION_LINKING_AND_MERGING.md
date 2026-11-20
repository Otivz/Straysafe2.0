# Report Resolution, Linking, and Merging

Status: **Current** (verified against backend and frontend source on 2026-11-20).

This guide explains how every report category in STRAYSAFE resolves—alone, when **linked** via `CaseLink`, and when **merged** via `/reports/merge-group`—along with the server-enforced guards before closure.

---

## 1. Global Statuses and Closure Dispositions

Across the Subdivision Admin workflow ([`backend/app/utils/case_vocab.py`](../../backend/app/utils/case_vocab.py)), every case uses four global statuses:

- `reported` — newly submitted
- `under_review` — picked up for Leader review
- `in_progress` — active coordination, intervention, or observation
- `closed` — ended with one documented closure disposition (or merged as status `18`)

### Closure Dispositions (`DISPOSITIONS`)

| Disposition | Outcome Group | Legacy Status | Label |
| :--- | :--- | :---: | :--- |
| `resolved_intervention` | `resolved` | `11` | Concern resolved through intervention |
| `owner_compliance` | `resolved` | `11` | Owner compliance verified |
| `pet_recovered` | `resolved` | `9` | Missing pet recovered |
| `handed_off` | `unresolved` | `17` | Handed off, no remaining subdivision action |
| `no_further_sightings` | `unresolved` | `17` | No further sightings; monitoring ended |
| `unresolved_other` | `unresolved` | `17` | Closed without confirmed resolution |
| `invalid_report` | `invalid` | `14` | Report determined invalid |
| `duplicate_report` | `invalid` | `14` | Duplicate of another report |
| `withdrawn_by_reporter` | `invalid` | `14` | Withdrawn by the reporter (resident action only) |

---

## 2. How Each of the 6 Report Categories Resolves

| Category | Admin Screen | Resolution Rules & Required Details | Linking / Merging Behavior |
| :--- | :--- | :--- | :--- |
| **1. Lost Pet** (`lost_pet`) | `MonitoredCasePage` | Ends as **`pet_recovered`** *only* through **`Record the owner's confirmation`** (*"The pet is home"*). Closing through the standard close dialog only allows non-recovery outcomes (`no_further_sightings`, `handed_off`, `unresolved_other`, `invalid_report`). | **Link (`Link Reports`):** Linking with a `Found / Unidentified Animal` opens owner–finder coordination; closing either one auto-closes both.<br/>**Merge:** Immediately closes the merged report's Lost Pet notice and restores the pet's registry status from `Lost` to `Active`. |
| **2. Found / Unidentified Animal** (`found_animal`) | `MonitoredCasePage` | Closed via **`Close report`** once reunited with owner / resolved (`resolved_intervention`), handed off to an external agency after recording contact (`handed_off`), or when sightings stop (`no_further_sightings`). | **Link:** Cross-linked cleanly with a matching `Lost Pet`; closing either one cascades closure to the other.<br/>**Merge:** Consolidates duplicate reports of the same found animal under one primary case. |
| **3. Animal Nuisance / Complaint** (`nuisance`) | `ComplaintPage` | Tracked via **Findings** (`Verified` incident + `Rule broken` + `Verified Responsible Person` or `Not identified yet`) and enforcement steps (`1st Warning` -> `2nd Warning + Summons` -> `Fine + Barangay Meeting`), then closed under **`Close this complaint`**. | **Same Occurrence link (`same_incident`):** Closes the duplicate complaint (`within 6h / 150m`) as `duplicate_report` so the offense counts once on the primary complaint, and notifies the other complainant when the primary complaint closes. |
| **4. Animal Safety Concern** (`safety`) | `CaseDetailPage` | Requires documenting the **Dangerous Animal Incident Outcome** (`dangerous_outcome`) unless closed as `invalid_report`, `duplicate_report`, or `withdrawn_by_reporter`. Blocks `resolved_intervention` / `owner_compliance` if `threat_ongoing` is `"yes"`. | **Merge:** Consolidates duplicate safety reports of the same animal under the primary case.<br/>**Link:** Closing the primary case automatically closes active linked reports. |
| **5. Injured / Distressed Animal** (`injured`) | `CaseDetailPage` | Requires documenting the **Animal Welfare Outcome** (`welfare_outcome`) before closing, unless closed as `invalid_report`, `duplicate_report`, or `withdrawn_by_reporter`. Commonly closed as `resolved_intervention` (treated/returned) or `handed_off` (Vet/Barangay). | **Merge:** Combines duplicate sightings of the same injured animal.<br/>**Link:** Recommended when cross-referencing an injured animal with a separate `Lost Pet` report so neither report is closed early. |
| **6. Other Animal Concern** (`other`) | `CaseDetailPage` | Standard `Overview` -> `Assessment` -> `Actions & follow-ups` -> `Close case` workflow using any eligible closure disposition. | Follows standard merge and link cascade rules. |

---

## 3. Merge vs. Link — Which Action to Choose

STRAYSAFE provides two distinct actions inside `Related Reports` ([`frontend/src/admin/pages/case/RelatedReportsBlock.tsx`](../../frontend/src/admin/pages/case/RelatedReportsBlock.tsx) and [`frontend/src/admin/dialogs/DuplicateReviewDialog.tsx`](../../frontend/src/admin/dialogs/DuplicateReviewDialog.tsx)):

### A. `Link Reports` (`POST /cases/{id}/links` — `CaseLink`)
- **Purpose:** Connect two distinct active cases about the same animal (for example, an **`Injured / Distressed Animal`** report and a **`Lost Pet`** report).
- **While Open:** Both reports remain open, keep their own workflows (injury care/referrals on one; Lost Pet community notice and owner recovery on the other), and cross-reference each other.
- **On Resolution (`close_linked_reports` in [`backend/app/utils/case_closure.py`](../../backend/app/utils/case_closure.py)):**
  - When **either** linked report closes, the SQLAlchemy `before_flush` hook automatically closes the active linked report as well, closes its open message threads, cancels pending follow-ups, closes Lost Pet notices, restores pet registry status if applicable, and writes an `AUDIT` entry (`CASE_CLOSED_LINKED`).
  - If the closing report uses `pet_recovered`, any non-lost-pet linked report (such as an `Injured` case) automatically maps its closure disposition to `resolved_intervention`.
- **Undoable:** Clicking **Unlink** removes only the link with a written reason; both reports remain intact.

### B. `Confirm Relationship & Link Reports` on Duplicate Candidate Card (`POST /reports/merge-group`)
- **Purpose:** Consolidate **true duplicate reports** of the same event (e.g., two neighbors reporting the same roaming dog in the same location).
- **Immediate Effect:**
  - The current open case stays open as `primary_report_id`.
  - The secondary report is immediately marked **`Merged — Duplicate`** (legacy status `18`, `duplicate_of_report_id = primary_report_id`).
  - If a `Lost Pet` report is merged this way, its Lost Pet community notice closes immediately as `merged` and the pet is restored to `Active` in the registry.
- **Resolution:** Only the primary report is worked on and closed via `Close case`; the merged child report stays archived inside `Related Reports` (and can be separated back via **Unmerge** if needed).

---

## 4. Built-In Server Closure Guards

Before `close_case` in [`backend/app/services/case_lifecycle.py`](../../backend/app/services/case_lifecycle.py) commits a closure, `disposition_availability` enforces these rules:

- **`owner_compliance`:** Blocked unless at least one warning with a compliant observation (`OwnerFollowUp.status == "complied"` or `OwnerWarning.status == "Resolved"`) exists on the case.
- **`handed_off`:** Blocked unless at least one external referral (`BarangayReferral`) has recorded contact (`referral_status != "to_contact"`).
- **`duplicate_report`:** Blocked unless an active `CaseLink` already connects the duplicate to its primary report.
- **`pet_recovered`:** Blocked inside the generic close dialog; only the dedicated owner-recovery confirmation flow can set it on `lost_pet` cases.
- **`injured` / `safety` outcomes:** Requires `welfare_outcome` for `injured` and `dangerous_outcome` for `safety` (except on `invalid_report`, `duplicate_report`, or `withdrawn_by_reporter`).
