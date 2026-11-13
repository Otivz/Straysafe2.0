# Push that rings and vibrates with the app closed; resident counts for the Leader only

- **Date:** 2026-11-13 04:37 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/push_service.py`, `backend/app/services/lost_pet_lifecycle.py`, `backend/tests/_offline_env.py`, `backend/tests/test_push_fcm.py`, `backend/tests/test_case_alerts.py`, `backend/tests/test_lost_pet_sighting_ping.py`, `frontend/src/resident/native/push.ts`, `frontend/android/app/src/main/AndroidManifest.xml`, `frontend/src/resident/pages/reports/LostReport.tsx`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/data/types.ts`, `docs/01-system/LOST_FOUND_ALERTS.md`, `docs/05-operations/push/FIREBASE_PUSH_SETUP.md`, `PUSH_NOTIFICATION_IMPLEMENTATION.md`, `docs/README.md`
- **Authorization:** The developer's report that the push did not arrive with the app closed, and the requirement that a resident be notified with sound and vibration whenever the phone is on (screen off, app closed, another app open); and "do not display the number of resident notified by the alerts, only the subdivision leader". The developer also said "you set up whatever you want".
- **Type:** Fix

## Intent

Make every notification ring and vibrate on Android whatever the app is doing, and keep the number of residents reached for the Subdivision Leader.

## Key changes

- **Why nothing arrived (found, not a code fault):** the backend has no Firebase service-account key (`fcm_configured` false), so it refused the app's registration (503; no phone is on record) and could send nothing to phones; the alert reached the 4 residents' in-app lists only.
- **Messages:** high priority (delivered at once to a sleeping phone), shown by Android itself with default sound, default vibration and maximum notification priority; public on a locked screen for a lost & found alert, private otherwise.
- **Channels:** `straysafe_notifications` and `straysafe_alerts`, both high importance with vibration and the brand light; the first channels (`straysafe_updates`, `lost_found_alerts`, made without vibration, unchangeable once on a phone) are deleted by the app; the manifest's default channel follows. Needs the next APK.
- **The key without editing `.env`:** with `FCM_SERVICE_ACCOUNT_FILE` absent, the backend uses `~/.straysafe/firebase-service-account.json` (outside the repository) when it exists; an empty variable means off (the test isolation now sets it empty, so no test can reach the real key).
- **Counts:** `residents_notified` is returned only to the Leader of the subdivision; the owner's "your notice is live" notifications and the report history line no longer state how many residents were told; the owner's screen says "Neighbours can see it"; older history lines with a number are shown without it.

## Validation evidence

- `test_push_fcm.py` 25/25 (new: the default key place, an empty variable, priority, sound, vibration, channels, lock-screen visibility); `test_case_alerts.py` 62/62; `test_lost_pet_sighting_ping.py` 51/51 (new: the count for the Leader only); `test_lost_pet_lifecycle.py` 146; `test_lost_pet_registration_first.py` 82; `test_push_notifications.py` 35/35. Frontend: `tsc` and ESLint clean, 192/192 unit tests.
- Not checked: a phone (needs the server key and the next APK).
