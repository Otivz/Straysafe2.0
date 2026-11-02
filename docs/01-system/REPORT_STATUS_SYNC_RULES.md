# Report status synchronization

**Status:** Current (2026-11-01)

This document defines where a report's status lives and how resolving an observation case updates it.

## Source of truth

- **`reports.current_status_id` is the only status of a report.** Every page reads it through the reports API (field `status_id`):
  - resident reports;
  - Subdivision and Barangay report views, lists and dashboards;
  - case details and the tracking timeline;
  - rescue and observation records;
  - counts.

  No page keeps its own copy.
- **The observation record, `owner_followups.status`, tracks the observation only:** `observing`, then `complied`, `closed` or `escalated`.
- **Synchronization rule:** an observation that ends as `complied` (Resolved) sets the case report to **11 Incident Resolved** in the same database transaction. The two can't disagree.
- **Warnings** (`owner_warnings.status`): when the case is resolved, its `Pending` and `Acknowledged` warnings become `Resolved`. `Appealed` warnings keep their appeal. Admin counts of pending warnings then stop counting a resolved case.
- **Merged duplicates (status 18)** keep "Merged — Duplicate" and point to the main case. Resident pages show the main case's outcome for them.

## Resolving an observation

Both endpoints use one function, `resolve_observation_case()` in `backend/app/utils/observation_resolution.py`:
- `POST /owner-followups/{id}/resolve`, from the Under Observation page;
- `POST /owner-followups/{id}/close` with `outcome: "complied"`, from the observation card's Confirm Owner Compliance.

1. **Validate before anything changes.** The observation must still be `observing`; otherwise the request gets 409 and nothing changes. The case report must not be:
   - closed by another workflow: rejected, claimed, released, deceased, dismissed, not found or merged;
   - handled by the Barangay: escalated, rescue, picked up, impounded or approved.

   In either case the resolution is refused (409) instead of overwriting that outcome.
2. Mark the observation `complied`, with its end time, staff member and remarks.
3. Set the case report to 11.
   - **The case** is the observation's report, or the main report it was merged into, plus any report linked into that case that is still open. Merged duplicates (18) are left as they are.
   - **Repeat reports** logged against the observation are separate incidents and keep their own status. So does any other report about the same animal.
4. Record the audit trail (see below).
5. Resolve the case's open warnings.
6. Commit everything at once. If any step fails, nothing is saved.
7. After the commit, notify:
   - the pet owner: one observation notification;
   - each resident who filed a resolved report: one "Report Update: Incident Resolved" notification, unless they are the owner or the staff member. The email uses an idempotency key per report and status.

A second click, or a retry, is refused because the observation is no longer open. It creates no second history row, audit entry or notification.

`outcome: "closed"` (observation concluded without compliance) and `"escalated"` don't change the report status. The report stays with its own workflow.

## Audit trail

For each report resolved:
- **A status history row** (status 11, the staff member and time). Its remarks hold:
  - the observation number;
  - the previous status;
  - the staff member's remarks;
  - for a linked report, the main case number.

  The earlier history is kept.
- **An audit-log entry** `RESOLVE_OBSERVATION_CASE`:
  - old values: previous status ID and name;
  - new values: status 11, observation ID, main case report ID, remarks, resolution time.
- **The observation timeline** gets a single "Observation ended: the owner complied" entry.

### Fixed alongside

The case-closure hook (`close_open_followups` in `backend/app/utils/case_closure.py`) used to re-close an observation that had just been resolved in the same transaction. It changed `complied` to `closed` and added a second "Observation ended" entry, so resolved cases left the Resolved tab and its count. It now skips observations already concluded in the transaction.

## Keeping pages current

- **Saves:** `frontend/src/utils/dataRefresh.ts` signals a data change after every save. The signal now also covers `/owner-followups`, `/manual-matching` and `/claim-assessments`, so the user's open pages and tabs refresh after resolving.
- **Changes by other users** are picked up by `useAutoRefresh`:
  - every 15 s, and on focus or when the page becomes visible again;
  - newly on the Subdivision dashboard and history pages;
  - on the resident and Subdivision report views as a light status check every 30 s, which reloads the full report only when its status changed.
- A browser refresh always reads the stored status.

## Code and tests

- Backend:
  - `backend/app/utils/observation_resolution.py`;
  - `backend/app/routes/owner_followups.py` (`/resolve`, `/close`);
  - `backend/app/utils/case_closure.py`.
- Frontend:
  - `frontend/src/utils/dataRefresh.ts`;
  - status refresh in `ResiViewReport.tsx`, `SubdViewReport.tsx`, `SubdDashboard.tsx`, `SubdHistoryReport.tsx`.
- Tests:
  - `backend/tests/test_report_status_sync.py` (isolated SQLite) covers the testing scenarios from the request;
  - `frontend/tests/dataRefresh.test.mjs` covers the refresh signal paths.
