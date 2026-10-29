# Correction: the saved holding stay limit carries over

- **Date:** 2026-10-28 10:17 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/05-operations/agents/feature-updates/2026-10-28_1017_correction-stay-limit-setting.md` (no code change)
- **Authorization:** part of the developer's "Lets do it remove the adoption feature"; it corrects the record [2026-10-28_1009_remove-adoption-frontend.md](2026-10-28_1009_remove-adoption-frontend.md).
- **Type:** Fix (record correction)

## Intent

Correct one statement in the Batch 2 record.

## Key changes

- The Batch 2 record says that older saves under `adoptionGraceDays` reset to the default. That is wrong. Both `BrgySettings.tsx` and `BrgyHoldingFacility.tsx` first read the separate key `holding_impound_stay_duration`, which the settings page has always written, so a Barangay's saved stay limit carries over. Only the copy inside the `straysafe_brgy_settings` object was renamed (to `holdingStayDays`), and it is used only when the separate key is missing.

## Validation evidence

- Read `frontend/src/pages/Barangay_Staff/BrgySettings.tsx` (preferences initializer) and `frontend/src/pages/Barangay_Staff/BrgyHoldingFacility.tsx` (`impoundStayDuration` initializer).
