# Phase 7: claim eligibility and correct report labels

- **Date:** 2026-11-01 14:23 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/utils/claim_custody.py`, `backend/app/routes/claims.py`, `backend/app/routes/reports.py`, `backend/app/models/pet_claim.py`, `backend/app/schemas/pet_claim.py`, `backend/app/main.py`, `backend/tests/test_claim_eligibility.py`, `backend/tests/test_case_claims.py`, `backend/tests/test_claim_identity.py`, `backend/tests/test_claim_photos.py`, `backend/tests/test_claim_proof_reuse.py`, `frontend/src/components/ClaimNotNeededPanel.tsx`, `frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx`, `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx`, `frontend/src/pages/citizen/PetClaimsDashboard.tsx`, `frontend/src/pages/citizen/ResiViewReport.tsx`, `frontend/src/pages/citizen/ResidentPet.tsx`, `docs/01-system/CLAIM_ELIGIBILITY_RULES.md`, `docs/06-future-proposals/RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "okay procedd to phase 7" (Phase 7 of `RESTORE_UI_AND_WORKFLOW_IMPROVEMENTS_2026-10-30.md`). FREEZE was OFF.
- **Type:** Feature

## Intent

Accept pet claims, evidence and claim decisions only for an animal someone actually holds. Never grant or complete a claim on an adopted or already-returned animal. Let the owner say whether the pet is home or still missing, and let staff close unneeded claims, undoing an erroneous approval. Keep the Lost Pet labels and the Pet Recovered action on actual lost-pet reports only.

## Key changes

- New `app/utils/claim_custody.py` decides whether the animal is held across the merged case. It uses open holding records, held custody values, Picked Up / Impounded statuses and, for an approved claim, the report status before the approval. Stale facility data after every holding record is discharged doesn't count. An adoption (holding Adopted, custody Adopted, or an approved handed-over adoption) always means not held. Returned animals are recognized too.
- `claims.py`:
  - Filing, evidence, and the Approved / Evidence Requested / Pending Review decisions need a held animal.
  - Handover Complete and Pet Received allow an approved claim to finish, but never for an adopted animal. Rejected is always allowed.
  - Filing is checked before anything is saved, so a refused filer is never assigned an unowned pet.
  - Approval saves `status_before_approval`.
  - New `POST /claims/{id}/whereabouts` (owner: home / still missing, notifies the handling leader) and `POST /claims/{id}/close-not-needed` (staff, with a reason; restores the pre-approval status with history, never after a completed return or adoption).
  - Every claim response carries `custody`.
- `pet_claims`: status **Not Needed**, and the columns `status_before_approval`, `owner_whereabouts`, `owner_whereabouts_note`, `owner_whereabouts_at`, `closed_reason`, `closed_by` and `closed_at`. Startup adds them when missing (non-destructive).
- `reports.py` `confirm-reunited`: residents may confirm only on a lost-pet report (category Lost Pet or the lost-pet form marker). Existing actor, open-case and holding-place rules are unchanged; staff keep their access.
- **Frontend:**
  - `ClaimNotNeededPanel` on the resident claims page and both staff claims pages; staff Approve and Request Evidence are disabled when the animal isn't held.
  - Resident report page: Lost Pet labels and the Pet Recovered button and form appear only on lost-pet reports.
  - My Pets **Resolve Case** opens only a lost-pet report.
- Test fixtures in four existing claim suites filed claims on animals nobody held. They now mark the animal as held in a facility; their assertions are unchanged.

## Validation evidence

- `tests/test_claim_eligibility.py` in `backend/`: 50/50 checks passed (isolated SQLite).
- These scripts exited 0, each run with `DATABASE_URL=sqlite:///:memory:` as a safeguard, after confirming each uses an isolated database:
  - adoption: `test_adoption_authority`, `test_adoption_available_again`, `test_adoption_catalog_handover`, `test_adoption_certificate`, `test_adoption_chat`, `test_adoption_local_times`, `test_adoption_single_record`, `test_adoption_task_superseded`, `test_adoption_tasks`, `test_pet_adoption_lock`;
  - claims and cases: `test_case_claims`, `test_case_closure`, `test_chat_isolation`, `test_claim_identity`, `test_claim_photos`, `test_claim_proof_reuse`, `test_claims_scope`, `test_leader_claimed_chat`, `test_lost_pet_contact`, `test_match_claim_shortcut`, `test_owner_return`, `test_pet_handover_sync`, `test_phase2_custody`;
  - holding: `test_holding_leader_barangay_view`, `test_holding_privacy`, `test_holding_stay_clock`;
  - earlier phases: `test_manual_matching`, `test_owner_warning_rules`, `test_trust_rule`, `test_match_cases`, `test_matches_gaps`, `test_identity_dispute`, `test_merge_pet_identity`, `test_under_observation_flow`, `test_owner_followups`, `test_push_notifications`, `test_case_review`, `test_closed_case_suggestions`.
- `npx tsc -b` in `frontend/`: exit 0. `npx eslint src/components/ClaimNotNeededPanel.tsx`: exit 0.
- No command touched the local MySQL database in this change.
- Not done: the claims screens were not checked in a browser, and no native-device checks were run.
