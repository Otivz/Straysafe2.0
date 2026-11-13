# FCM server key placed on the backend machine; the project's sending permission is missing

- **Date:** 2026-11-13 05:19 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `docs/05-operations/push/FIREBASE_PUSH_SETUP.md`, `docs/README.md`; outside the repository: `%USERPROFILE%\.straysafe\firebase-service-account.json`
- **Authorization:** The developer's "yes" to putting the server key in place for them; they then clicked "Generate new private key" in the Firebase console page opened for them, and chose to ask the project's owner for the missing permission.
- **Type:** Fix

## Intent

Give the backend its Firebase server key so it can send push to the Android app.

## Key changes

- The key the developer downloaded (`straysafe-1947e-firebase-adminsdk-fbsvc-….json`) was moved, unread, from Downloads to `%USERPROFILE%\.straysafe\firebase-service-account.json` (outside the repository and OneDrive), where the backend finds it without `.env`; no copy is left in Downloads. The backend (running with `--reload`) reports FCM configured; it now accepts the app's registration.
- **Found:** the Firebase CLI login on this computer cannot see `straysafe-1947e`, and the developer does not own that project. Its service account `firebase-adminsdk-fbsvc@straysafe-1947e.iam.gserviceaccount.com` has **no** permission in the project (`testIamPermissions` returns none), so FCM refuses every send (403 `IAM_PERMISSION_DENIED` on `cloudmessaging.messages.create`), still after 15 minutes. Only the project's owner can grant it **Firebase Cloud Messaging API Admin**; the setup guide's troubleshooting table now says so.

## Validation evidence

- The key file is a service account of project `straysafe-1947e`; Google accepted it (403, not 401); FCM validate-only sends (nothing delivered) were refused for 15 minutes; the FCM API state cannot be read by the account either. No key content was printed.
