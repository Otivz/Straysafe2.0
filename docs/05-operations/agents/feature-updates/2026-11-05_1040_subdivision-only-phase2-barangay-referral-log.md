# Subdivision-only Phase 2: Barangay Referral log (backend)

- **Date:** 2026-11-05 10:40 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/models/barangay_referral.py` (new), `backend/app/schemas/barangay_referral.py` (new), `backend/app/routes/barangay_referrals.py` (new), `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/tests/test_barangay_referrals.py` (new), `Database3.3.txt`, `Database3.3_subdivision.sql` (untracked copy), `docs/01-system/BARANGAY_REFERRAL_LOG.md` (new), `docs/README.md`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/05-operations/agents/feature-updates/2026-11-05_1040_subdivision-only-phase2-barangay-referral-log.md`
- **Authorization:** The developer's instruction "Phase 2" on 2026-11-05, after approving through clarification questions: the schema change (two new tables, created on the copy database `straysafe_subdivision`), referrals to the subdivision's own Barangay only (San Vicente), and a final outcome that closes the report.
- **Type:** Feature

## Intent

Phase 2 of [SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md](../../../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md): the Subdivision Leader records the referral to the external Barangay, the updates the Barangay reports, and the final outcome, clearly separated from StraySafe's own actions. Backend only; the screens are Phase 3.

## Key changes

- **Schema (approved):** tables `barangay_referrals` (one per report) and `barangay_referral_updates`, created by `create_all` at backend startup and added to both SQL scripts. Beyond the planned fields: `outcome_date`, `outcome_note`.
- **Routes** (`routes/barangay_referrals.py`, leader of the report's subdivision or Administrator only): `GET /referrals/`, `GET /reports/{id}/referral`, `POST /reports/{id}/referral`, `POST /referrals/{id}/updates`, `POST /referrals/{id}/outcome`.
- **Referral:** statuses 1 and 2 move to 4 with a history entry; the endorsement letter is kept or written; no `Rescue` row; no Barangay account notified; the reporter is notified. Merged and other-status reports are refused; the existing animal-record rule applies. An older status-4 case can get a referral record without a status change (no automatic back-fill).
- **Updates:** labelled by source ("Reported by Barangay"), with the reported date, note, https evidence link and recorder. Never change status, custody, facility, pin or holding records.
- **Outcome:** once, only at status 4, maps to a closing status (9, 10, 11, 12, 17) with a history entry starting "Reported by Barangay San Vicente on <date>, recorded by <leader>". No updates afterwards.
- **Audit:** `Create Barangay Referral`, `Record Barangay Update`, `Record Barangay Outcome`.

## Validation evidence

- `backend/tests/test_barangay_referrals.py` (throwaway SQLite): **46 of 46 checks pass**: access scope (resident, Barangay account, other subdivision refused), audit entries, no custody/facility/pin/holding change, outcome closes once, no updates after the outcome, merged/rejected/no-animal-record refused, no Rescue row, reporter notified and no Barangay notification.
- Full backend suite after Phase 2: 78 of 124 pass; no test changed result compared with Phase 1 (the 46 known role-3 failures listed in the Phase 1 record, unchanged).
- The new SQL in `Database3.3.txt` was not executed against MySQL; the tables on the running database come from the SQLAlchemy models at startup.
- `docs/01-system/DATABASE_SCHEMA.md` is generated from `straysafe_db` and does not list the two new tables yet; regenerate it after the backend has created them.
