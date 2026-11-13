# Change record: Focused verification of Lost & Found messaging and multi-link conversation isolation

- **Date:** 2026-11-12 06:41 (UTC)
- **AI tool:** Antigravity
- **Authorization:** Developer instruction ("perform one focused verification of the Lost & Found messaging behavior affected by your cleanup")
- **Type:** Polish

## Files changed

- `backend/tests/test_case_messaging.py`
- `frontend/tests/adminMonitoredCase.test.mjs`
- `docs/05-operations/agents/feature-updates/2026-11-12_0641_verify-multi-link-messaging-isolation.md`
- `docs/README.md`

## Summary of changes

- Added focused multi-link conversation isolation assertions to `backend/tests/test_case_messaging.py` (5 new checks, 105 total) and `frontend/tests/adminMonitoredCase.test.mjs` verifying that:
  - Multiple Found Animal reports linked to one Lost Pet report each open their own separate 1-to-1 resident-to-resident `bridge` conversation with the pet owner.
  - Neither finder can read or write the other finder's `bridge` (`404`) or see it in `GET /case-messages`, while the pet owner sees both.
  - The Subdivision Leader's 1-to-1 `direct` conversations with each linked Found Animal reporter target each reporter's own report (`reportId: f.caseId`) and remain isolated from each other.

## Verification

- `..\.venv\Scripts\python.exe tests\test_case_messaging.py`: 105/105 checks passed
- `..\.venv\Scripts\python.exe tests\test_lost_found_matching.py`: 64/64 checks passed
- `node --test tests/adminMonitoredCase.test.mjs tests/adminLostFound.test.mjs tests/residentCaseMessages.test.mjs`: 32/32 tests passed

