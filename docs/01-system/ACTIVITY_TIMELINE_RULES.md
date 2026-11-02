# Activity timeline: owner observation events and privacy

Phase 8 of the restore plan. These rules cover how an owner observation appears on a report's activity timeline and in its "where is it now" text, and what other residents can't see there.

## Observation events on the report's history

Every observation event is written to the report's own status history, so every timeline (resident, Subdivision Leader, Barangay) shows it with the date it happened:

| Action | Timeline entry |
| --- | --- |
| Leader starts an observation, or a first warning starts or restarts it | **Observation started:** the owner has until *deadline* to address the report |
| Leader grants the single extension | **Observation extended by N days:** new deadline *deadline* |
| Leader closes it as complied / closed / escalated; resolve; endorse to the Barangay | **Observation ended:** the owner complied / closed by the subdivision / endorsed to the Barangay |
| The case is closed, merged or escalated while the observation is open | **Observation ended:** closed with the case / endorsed to the Barangay |

- The entries never name the owner or give contact details. The leader's extension and closing reasons stay on the observation, which only staff and the owner see; they are not copied into the timeline.
- Deadlines are shown in local time. Follow-up times are stored in UTC.
- The timeline labels these entries **Observation started / extended / ended**. They are never merged with holding-place log entries.

Before this phase, only the warning-triggered start wrote a timeline entry. A manual start, an extension, a close and an automatic close wrote nothing.

## History timestamps

History entries take the database's own clock (the column default). Eight entries in the warning and follow-up routes used to pass the app server's UTC time explicitly. With the database on local time, that put them 8 hours earlier than the entries around them. They now use the database clock like every other entry.

## "Where is it now"

`GET /reports/{id}` returns `observation`: the case's latest owner observation, with `open`, `status`, `due_at` (UTC ISO), `extended`, `ended_at` and `outcome`. It contains no owner details, so every viewer of the report gets it.

`getCaseStages` and `getWhereNow` (`frontend/src/utils/caseStages.ts`) use it:

- **Open observation:** "Under observation until *date*" and "Under observation: the owner has until *date* to address the report." The step is the subdivision's check, not "In safe care at a holding place".
- **Ended, report still at status 7:** "Observation ended; the subdivision decides the next step."
- **Closed case:** its outcome, as before.
- **Status 7 without an owner observation** (a bite case observed at a facility), or **an animal held in a facility:** the care step, as before.

## Names and contact details on the public timeline

For any viewer who isn't staff, timeline text already had the reporter's name (except for a resident reporter's own view) and the registered owner's name (except for the owner) taken out. This phase adds:

- the names of owners observed on the case, including owners recorded without an account, except for that owner themselves;
- phone numbers and email addresses, which are replaced with "[number hidden]" / "[email hidden]".

Staff still see the full text.

## Shared components

No chat, polling, adoption dashboard, holding action, sidebar or notification-routing code was changed in this phase. The source commit's chat routing and polling fixes are not in this clone and were not reapplied. The adoption, chat-isolation, holding and handover test suites still pass.

## Code and tests

- Backend: `app/utils/owner_followups.py` (`record_observation_event`, `observation_summary`), `app/routes/owner_followups.py`, `app/routes/warnings.py`, `app/utils/case_closure.py`, `app/routes/reports.py` (report detail), `app/schemas/report.py`, `app/utils/report_visibility.py`
- Frontend: `src/utils/caseStages.ts`, `src/utils/caseTimeline.ts`, `src/components/RescueTimeline.tsx`
- Tests: `python tests/test_activity_timeline.py` from `backend/` (isolated SQLite); `node --test tests/caseStagesObservation.test.mjs` from `frontend/`
