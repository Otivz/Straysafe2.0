# Lost & Found: the Leader's status card, notification alerts and the case-page notice window

- **Date:** 2026-11-12 18:04 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/data/alertSchedule.ts` (new), `frontend/src/admin/data/types.ts`, `frontend/src/admin/data/actions.ts`, `frontend/src/admin/data/context.ts`, `frontend/src/admin/data/monitored.ts`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/live/actions.ts`, `frontend/src/admin/live/LiveDataProvider.tsx`, `frontend/src/admin/pages/case/monitored/Lane.tsx`, `frontend/src/admin/pages/case/monitored/Alerts.tsx` (new), `frontend/src/admin/pages/case/MonitoredCasePage.tsx`, `frontend/src/admin/pages/case/CaseDialogs.tsx`, `frontend/src/admin/pages/case/dialogState.ts`, `frontend/src/admin/dialogs/AlertDialogs.tsx` (new), `frontend/src/admin/styles/pages.css`, `frontend/src/preview/lib/place.ts` (new), `frontend/tests/adminAlertSchedule.test.mjs` (new), `frontend/tests/adminMonitoredCase.test.mjs`, `frontend/tests/adminLiveAdapters.test.mjs`, `frontend/tests/liveLostFound.browser.mjs`, `frontend/tests/liveInterfaces.browser.mjs`
- **Authorization:** The same brief and approvals as record 2026-11-12_1804, including the developer's two requests on the mockup ("organize here, cause its too messy" for the alert window, and "improve the Nothing needs you right now. section") and "okay lets proceed with the implementation". The approved calm page was otherwise left as it was. Nothing was committed or pushed.
- **Type:** Feature

## Intent

Give the Leader what the approved mockup showed: a status card instead of the long facts line, a place to see and manage the alerts of a case, an organized alert window that says exactly what will happen, and a way to publish a found animal's Community notice from its case, kept separate from alerts.

## Key changes

- **Status card** (`situationTiles`, `monitoringLine`, `Lane.tsx`): "Nothing needs you right now" with "Under monitoring since … · last update …", over one tile per topic (Sightings, Linked reports, Community notice, Alerts, Barangay, and Last contact / Next check when they exist), each with a state dot, one line of detail and at most one action. "Needs you" keeps its list above the same tiles. A private report has no notice or alerts tile.
- **Notification alerts section** (`Alerts.tsx`): each alert's state, cadence and end, next send, how often it went out, its message, Pause / Resume / Edit / Stop (Cancel before the first send) and its history.
- **Alert window** (`AlertDialogs.tsx`): Message, Recipients and Schedule groups with aligned labels; a lock-screen preview; "What happens" (sends, to how many, on tap, first, then, next sends, end, total), worded from the server's `push_ready` ("In the app only: phone push is not set up yet"); the heavy-schedule warning; one retry key per content so a repeated tap never sends twice. Older reports without a pet name read "Have you seen this dog?" and "until the pet is home". `alertSchedule.ts` mirrors the server's schedule rules for the preview.
- **Publish a Community notice** from a found animal's case (the same two requests as before), and stop/cancel confirmations that never touch the notice.
- **Found-notice title fix:** the Leader's notice list no longer says "Found cat near Near the clubhouse" (`placePhrase`, shared with the Resident app).

## Validation evidence

- Looked at 15 photographed states (desktop and phone, missing pet and found animal, calm, with a repeating alert, two alerts, paused, the window in each schedule mode, the edit and publish windows). Fixed after looking: unnamed pets ("Still looking for Missing dog"), "1 residents", "2 active, 1 paused" for one scheduled and one paused alert, labels centred on two-line rows, the long "Sends" line, a wrapping "From now".
- `tsc -b`: no errors; ESLint on every changed file: clean (the whole-frontend run still reports errors in four files this work did not touch); `vite build`: built.
- Frontend unit tests: 192 of 192, including `adminAlertSchedule.test.mjs` (7) and the updated `adminMonitoredCase.test.mjs` (15).
- `liveLostFound.browser.mjs`: 14 of 14. It caught a wording clash ("No found-animal report linked" satisfied a wait for "report linked" before the link was saved); the tile now says "is linked". `liveInterfaces.browser.mjs`: 60 of 60, with waits updated for "Nothing needs you right now" (no full stop) and the notice tile.
