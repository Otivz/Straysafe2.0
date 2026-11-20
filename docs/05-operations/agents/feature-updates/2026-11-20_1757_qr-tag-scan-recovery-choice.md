# QR Tag Scan Recovery Choice

- **Date:** 2026-11-20 17:57 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/routes/pet_tags.py`, `backend/app/services/lost_pet_lifecycle.py`, `backend/tests/test_pet_tag_recovery.py`, `frontend/src/resident/data/reducer.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/actions.ts`, `frontend/src/resident/pages/pets/PetTagScansPage.tsx`
- **Authorization:** User request in chat ("Maybe choose if recoverd or not by the qr something like that" / "Implement now")
- **Type:** Feature

## Intent

When a pet is marked `Lost`, resolving a QR tag scan message previously only marked the `PetTagScan` row as `resolved`, leaving the pet's `Lost` status, active `LostPetAlert`, and Lost Pet `Report` open unless the owner closed them separately. Owners can now choose directly from the QR tag scan workflow whether the pet is back home (confirming recovery and returning the pet to `Active`) or still missing (marking only the scan `Done`).

## Key changes

- **`backend/app/routes/pet_tags.py`:** Added optional `ResolveScanBody` (`recovered: bool = False`, `note: Optional[str] = None`) and shared `_resolve_and_maybe_recover` handler for `POST /pets/{pet_id}/tag/scans/resolve` and `POST /pets/{pet_id}/tag/scans/{scan_id}/resolve`. When `recovered=True`, it runs `lost_pet_lifecycle.confirm_recovery` on the pet's active lost-pet alert (or restores `Pet.status = "Active"` directly if no open alert remains) and resolves any remaining open QR tag scans.
- **`backend/app/services/lost_pet_lifecycle.py`:** Updated `confirm_recovery` to also call `pet_tags.resolve_scans` when `report.pet_id` is present so recoveries confirmed from the Lost Pet report flow close open QR tag scans in the same transaction.
- **`frontend/src/resident/data/reducer.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/actions.ts`:** Added the `petTag/resolve` action and typed response fields (`recovered`, `pet_status`, `report_id`, `alert_id`) so recovery updates refresh Resident `pets`, `notices`, and the closed `report_id` automatically.
- **`frontend/src/resident/pages/pets/PetTagScansPage.tsx`:** When the pet is `Lost`, tapping **Mark as done** opens a choice sheet (*Yes, pet is back home (Mark as recovered)* vs *No, still missing (Just mark scan done)*). Also surfaces a **"{pet.name} is back home (Mark as recovered)"** button and status copy even after individual scans are already marked `Done`.
- **`backend/tests/test_pet_tag_recovery.py`:** Added isolated SQLite regression tests verifying both `recovered=False` and `recovered=True` scan resolution, reverse sync from `confirm_recovery`, and the no-open-alert fallback.

## Validation evidence

- `python tests\test_pet_tag_recovery.py` -> `[PASS] test_pet_tag_recovery`
- `python tests\test_pet_tag_cooldown_per_pet.py` -> `[PASS] test_pet_tag_cooldown_per_pet`
- `npm run build` (`tsc -b && vite build`) in `frontend/` -> exit code 0
