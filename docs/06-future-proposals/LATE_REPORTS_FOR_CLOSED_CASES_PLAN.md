# Late reports of closed cases

- **Status:** proposal, not built. Written 2026-10-27.
- **Problem in one line:** when someone reports an animal after its case was already closed or impounded, the system cannot connect the two, so the late report becomes a brand-new active case.

## 1. The scenario

A dog is impounded on Monday. On Wednesday a resident who saw it on Sunday reports it. Today:

- The new report is not compared with the impounded case, so no duplicate suggestion appears.
- The Subdivision Leader sees a fresh, unconnected report and may verify and escalate it.
- The Barangay could dispatch a rescue for an animal that is already in the facility.
- The reporter is never told the animal was already handled.

## 2. Why closed cases disappear today

This is deliberate. The duplicate rules hide closed cases so the queue never asks leaders to merge two finished reports. The rule is applied in five places:

| # | Where | What it does |
|---|---|---|
| 1 | `backend/app/routes/matches.py`, duplicate candidates (`Report.current_status_id.notin_(RESOLVED_STATUS_IDS)`, impounded excluded) | A new report is never compared with closed or impounded reports |
| 2 | `backend/app/routes/matches.py`, start of the report scan | A closed report is not scanned at all |
| 3 | `backend/app/routes/matches.py`, `GET /matches/duplicates` | An open suggestion disappears from the list once either side closes |
| 4 | `backend/app/routes/matches.py`, `GET /matches/duplicates/report/{report_id}` | Same, for one report's duplicates |
| 5 | `backend/app/utils/case_groups.py`, `suggestion_closed_reason` | Confirming such a suggestion is refused: "Case #X is already closed, so this suggestion no longer needs a decision." |

`RESOLVED_STATUS_IDS` in `matches.py` and `CLOSED_CASE_STATUS_IDS` in `case_groups.py` are both 3, 8, 9, 10, 11, 12, 14, 17, 18 (8 Impounded counts as closed for matching). Other limits today: within 1.5 km (`DUPLICATE_RADIUS_KM`), within 7 days of each other (`DUPLICATE_WINDOW_DAYS`), score at least 65 (`DUPLICATE_MIN_SCORE`).

Removing these filters is not safe on its own: merging an open report into a closed case has never run, because rule 5 always blocked it, and it touches owner questions, case history and analytics.

## 3. Proposed behaviour

### 3.1 A separate "late report" suggestion

Only this pairing is new:

- the **new** report is open, and
- the other report belongs to a case that **closed or was impounded within the last 7 days**, and
- the usual limits hold (same species or unknown, within 1.5 km, score at least 65).

Two closed reports are still never paired, and older closed cases are not searched. Such a suggestion is marked as a late-report suggestion (for example `ReportMatch.match_kind = 'LATE_REPORT'`), so lists and screens can show it apart from normal duplicates.

The closing time comes from status history: the time of the latest `StatusHistory` row that moved the case into a closed status, or into 8 Impounded. Reports have no `closed_at` column.

### 3.2 What the leader sees and decides

The leader's duplicate review shows: **"Possible late report of closed Case #X (closed Oct 25: Impounded)"**, with both photos, distance and time, as for duplicates.

| Choice | Effect |
|---|---|
| **Link to closed case** | The new report is merged into Case #X (status 18, `duplicate_of_report_id = X`). Case #X stays closed, with its status, custody, claims and adoption untouched. The new report appears in Case #X's history as a late sighting. The reporter is notified. |
| **Not the same animal** | The suggestion becomes `NOT_A_MATCH`; the new report continues as its own active case. |

The AI only suggests; nothing is linked or closed without the leader.

### 3.3 What the outcome of the old case tells the leader

Shown as a hint next to the choice. It is not applied automatically:

| Old case closed as | Usual meaning of a later report |
|---|---|
| 8 Impounded, 12 Deceased | Almost always a late report: link it |
| 9 Claimed by Owner, 10 Released | If seen after closing, a new incident (the animal is loose again): keep it, and for a claimed pet consider telling the owner |
| 11 Incident Resolved | Compare when it was seen with when the case closed |
| 17 Animal Cannot Be Found | The animal is back: reopening the old case may be right (not part of this plan; reopening stays a separate staff action) |

### 3.4 Reporter message

On "Link to closed case", the reporter gets an in-app notification: "Thank you. This animal was already handled in Case #X on Oct 25 (Impounded). Your report was added to that case's history." The reporter's report page shows it as merged, with a link to the case if they may see it.

### 3.5 Analytics and maps

A linked late report has status 18, which analytics and the heat map already leave out, so it is not counted as a second incident. The original sighting point of Case #X is unchanged.

## 4. Optional: when was it seen?

Without a "seen at" time the system only knows when a report was filed, so it cannot tell a late report from a new incident; the leader judges from the description. An optional **"When did you see it?"** field on the report form (default: now, never in the future) would show "seen before / after Case #X closed" next to the suggestion. This needs a new column (for example `reports.seen_at`) and a migration, so it is listed separately.

## 5. Changes needed

| Area | Change |
|---|---|
| Matching (`matches.py`) | A second candidate query for cases closed or impounded within 7 days, used only when the new report is open; tag those suggestions as late reports |
| Lists (`GET /matches/duplicates`, `/duplicates/report/{id}`) | Keep late-report suggestions visible while the new report is open |
| Confirming (`case_groups.py`) | `suggestion_closed_reason` lets a late-report suggestion through; a new confirm path merges the new report into the closed case without changing the case |
| Data | A way to tell late-report suggestions apart (a `match_kind` column, or a marker); migration needed if a column is added |
| Leader screens | Label and wording for late-report suggestions; "Link to closed case" and "Not the same animal" |
| Notifications | Message to the reporter on linking |
| Tests | See section 6 |
| Docs | Rules in `docs/01-system/`, the defense plan, a change record per step |

## 6. Tests to write

- A new open report near a case impounded 2 days ago gets a late-report suggestion; one near a case closed 10 days ago does not.
- Two closed reports are never paired.
- "Link to closed case" closes only the new report (status 18), and leaves the closed case's status, custody, holding record, claims, owner questions and adoption unchanged.
- "Not the same animal" keeps the new report active and stops the pair being suggested again.
- The reporter receives the notification; residents who may not see Case #X do not get its details.
- Analytics and the heat map count the incident once.
- Normal duplicates between two open reports behave as before.

## 7. Phases

1. **Detection and the leader's choice** (sections 3.1, 3.2, 3.5): the backend changes and tests, plus the leader screen.
2. **Reporter message** (section 3.4).
3. **"When did you see it?"** (section 4), with its migration.
4. Later, if wanted: a "Reopen case" action for cases closed as Cannot Be Found.

## 8. Open questions for the team

- Is 7 days the right look-back for closed cases, or should impounded animals be searched for as long as they are in the facility?
- Should a late report be allowed to change a closed case at all (for example add its photo to the case), or only be recorded beside it?
- Who may link: the Subdivision Leader only, or Barangay staff too, for cases that reached the barangay?

## 9. For the defense

> "A late report is not lost. If the animal was already handled, the system suggests linking the late report to the closed case, the leader confirms, the closed case stays as it was, and the reporter is told. If the animal is loose again, it stays a new case. The AI suggests; a person decides."

Until this is built, say plainly that it is planned: today a late report becomes a separate case, and the leader connects it by hand when reviewing.
