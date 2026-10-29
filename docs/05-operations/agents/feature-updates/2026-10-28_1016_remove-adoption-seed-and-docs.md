# Adoption removed from the seed and the core documents (Batches 3 and 4, partly)

- **Date:** 2026-10-28 10:16 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:**
  - Seed: `Database3.3.txt`
  - Docs edited: `docs/01-system/overview.md`, `docs/01-system/ANALYTICS_SPECIFICATION.md`, `docs/01-system/MESSAGING_GOVERNANCE.md`, `docs/01-system/DFD/04_DFD_REVIEW.md`, `docs/01-system/ERD/00_ERD_MODULE_OVERVIEW.md`, `docs/02-project/DEFENSE_PLAN.md`, `docs/02-project/SYSTEM_PRESENTATION_FLOW.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/archive/README.md`, `docs/06-future-proposals/REMOVE_ADOPTION_PLAN.md`
  - Moved with `git mv` to `docs/archive/removed-adoption/`: `docs/01-system/ERD/08_ADOPTION_ERD.md`, `docs/01-system/ERD/08A_APPLICATION_VERIFICATION_ERD.md`, `docs/01-system/ERD/08B_ASSIGNMENTS_SCREENING_ERD.md`, `docs/01-system/ERD/08C_POST_ADOPTION_MONITORING_ERD.md`, `docs/01-system/ERD/08D_CERTIFICATE_CASE_OWNERSHIP_ERD.md`, `docs/01-system/ERD/mermaid/08_adoption.mmd`, `docs/01-system/ERD/mermaid/08a_application_verification.mmd`, `docs/01-system/ERD/mermaid/08b_assignments_screening.mmd`, `docs/01-system/ERD/mermaid/08c_post_adoption_monitoring.mmd`, `docs/01-system/ERD/mermaid/08d_certificate_case_ownership.mmd`, `docs/03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md`
  - Test docstring: `backend/tests/test_chat_isolation.py` (link to the moved audit)
  - This record
- **Authorization:** the developer: the panel did not approve adoption; "1. yes" to removing it from the whole system; then "Lets do it remove the adoption feature".
- **Type:** Fix (scope reduction: removes a feature the panel rejected)

## Intent

Make the seed and the current documents match the system without adoption.

## Key changes

- `Database3.3.txt`: the 9 adoption tables are removed (54 tables remain), and a 2026-10-28 revision note records what stays unused: `facility_status` rows 6 and 7, the `Adoption` chat thread type, `push_adoptions`, and the holding adoption columns. The rows and columns are kept so older references stay valid. The server refuses statuses 6 and 7.
- Overview: adoption is removed from the summary, roles and capabilities. Holding now states that impoundment is the only outcome after the stay limit.
- Analytics specification: the Adoption metric and its operations rule are removed, and "currently held" is now statuses 1, 2 and 8.
- Defense plan: demo steps 9 and 10 now show a claim review and an impoundment. Questions 68–71 (same numbers) cover claims, why there is no adoption, extending a hold (marked planned) and unclaimed animals.
- Presentation flow: the catalog, journey map, certificate verifier, adoption application, 9-stage lifecycle and adoption task sections are removed, and sections are renumbered. `/subd/endorsements` is described correctly as the rescue endorsement letter archive.
- Messaging governance: the adoption chat permission rows are removed and the `Adoption` thread type is marked retired. The older audit findings stay as history.
- Adoption-only ERDs (module 08, 08A–08D, their diagrams) and the adoption chat audit are archived in `docs/archive/removed-adoption/`, with index and link updates.

## Validation evidence

- Strict documentation audit: the only failures left are 4 links to change records deleted before this session (`2026-10-25_1347`, `_1354`, `_1501`). `git restore docs/05-operations/agents/feature-updates/` would bring them back.
- Full isolated backend suite after Batch 2: 77 of 77 files pass. `test_chat_isolation.py` re-run after its docstring change: 14 of 14.
- Not done: the seed was not loaded into a database after this edit. The 9 empty adoption tables still exist in the local `straysafe_db` (dropping them needs the developer's approval). The ERD/DFD documents (`12_COMPLETE_SYSTEM_ERD.md`, `00_ERD_MODULE_OVERVIEW.md` body, `MANUSCRIPT_DATABASE_DESIGN.md`, the DFD set) still describe adoption.
