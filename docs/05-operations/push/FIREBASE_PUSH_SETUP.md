# Firebase push notifications for the Android app: setup

Status: **Current** (2026-11-13). The code is in place; push reaches phones only after these steps. Until then, alerts and every other notification still reach each resident's notification list in the app, and the Leader's alert window says "In the app only: phone push is not set up yet".

**Never paste either Firebase file into a chat, an issue or a screenshot, and never commit it.** Both are already ignored by Git (`google-services.json`, `*firebase-adminsdk*.json`, `*service-account*.json`).

## What is needed

| File | Where it comes from | Where it goes |
|---|---|---|
| `google-services.json` (identifies the app to Firebase) | Firebase console, Android app `com.straysafe.app` | The GitHub repository secret `GOOGLE_SERVICES_JSON` (for the APK workflow); for a local Android Studio build, `frontend/android/app/google-services.json` |
| A service-account key (lets the backend send) | Firebase console, Project settings → Service accounts | A folder **outside** the repository on the backend machine; its full path in `FCM_SERVICE_ACCOUNT_FILE` |

Both must come from the **same** Firebase project.

## 1. Create the Firebase project and the Android app

1. Open the Firebase console and add a project (or add Firebase to an existing Google Cloud project). Google Analytics is not needed.
2. Add an **Android** app with the package name **`com.straysafe.app`** (exactly; it is `appId` in `frontend/capacitor.config.ts`). A nickname such as "StraySafe Resident" is fine; no SHA-1 is needed for push.
3. Download `google-services.json`.

## 2. Give the file to the APK build

1. GitHub → the repository → Settings → Secrets and variables → Actions → **New repository secret**.
2. Name: `GOOGLE_SERVICES_JSON`. Value: the whole text of `google-services.json`.
3. Run **Build Android APK** (Actions tab, Run workflow). The step "Add the Firebase file for push notifications" checks the file is for `com.straysafe.app`, and the build applies Google Services because the file is present. Without the secret the APK is still built, without push.

## 3. Give the backend its key

1. Firebase console → Project settings → **Service accounts** → **Generate new private key**. A JSON file downloads.
2. Move it to a folder outside the repository on the machine that runs the backend (for example `C:\StraySafe\secrets\straysafe-firebase.json`), readable only by the account that runs the backend.
3. Either save it as `firebase-service-account.json` in the folder `.straysafe` of the home folder of the account that runs the backend (`%USERPROFILE%\.straysafe\firebase-service-account.json`, found without any setting), or set the environment variable **`FCM_SERVICE_ACCOUNT_FILE`** to its full path (an empty value turns FCM off). The backend reads it when it next sends; no restart is needed.
4. The backend sends with Google's `google-auth` package, which is already installed; nothing else is added.

## 4. Check it

1. Install the new APK and sign in as a resident (a resident already signed in only needs to open the app once: it registers again). Android 13 and later asks once for permission to show notifications: allow it.
2. As the Subdivision Leader, open a missing pet's case, **Send an alert**, "Send now" to all residents. The phone shows it within about a minute; a tap opens the notice. The window's "What happens" no longer says push is not set up.
3. `GET /push/status` (signed in as that resident) reports `"enabled": true` and one device; `POST /push/test` sends "push is working" to that resident's own phone (once a minute at most).

## If it does not work

| What you see | Likely cause |
|---|---|
| The app's registration gets 503 | `FCM_SERVICE_ACCOUNT_FILE` is not set for the backend process, or the file is not at that path |
| The in-app row arrives, no phone notification | Notifications are off for the app or its channel ("Lost & found alerts" / "Updates on your reports") in Android settings; or the resident turned "Lost & found alerts" off in StraySafe Settings |
| A delivery in `push_deliveries` has `last_error` "device gone (…)" | Google no longer accepts that phone's registration: the app was reinstalled or its data cleared (sign in again on the phone and it registers again), or `google-services.json` and the service-account key are from different Firebase projects (replace one so both match) |
| A delivery stays `queued` and is retried | Google was busy or unreachable; it is tried again on its own |
| Every send is refused with `Permission 'cloudmessaging.messages.create' denied` (403, `IAM_PERMISSION_DENIED`) | The service account the key belongs to has no role in the project (seen 2026-11-13 with `firebase-adminsdk-fbsvc@straysafe-1947e.iam.gserviceaccount.com`: Firebase made it without permissions). The project's **owner** grants it the role **Firebase Cloud Messaging API Admin** in Google Cloud → IAM → Grant access. A project editor cannot. Nothing needs restarting afterwards |

## If a key leaks

Firebase console → Project settings → Service accounts → delete the key in Google Cloud (IAM → Service accounts → Keys), generate a new one, replace the file on the server and restart the backend. `google-services.json` identifies the app and is not a sending credential, but it is kept out of Git all the same.

## Related

- How alerts work: [LOST_FOUND_ALERTS.md](../../01-system/LOST_FOUND_ALERTS.md).
- Web Push for browsers (VAPID keys, optional and separate): [PUSH_NOTIFICATION_IMPLEMENTATION.md](../../../PUSH_NOTIFICATION_IMPLEMENTATION.md).
- The APK workflow: [ANDROID_RESIDENT_APP.md](../ANDROID_RESIDENT_APP.md).
