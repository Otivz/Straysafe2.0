# Neighbor-to-Neighbor Lost Pet Sighting Ping

**Status:** Reference. The workflow summary was updated on 2026-11-11; older map/component descriptions below describe the former implementation. [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md) is the current source for behavior, privacy, files and verification limits.

Neighbor-to-Neighbor Lost Pet Sighting Ping helps residents of a subdivision find a lost pet together. The Lost Pet report publishes its Neighborhood Alert when it is filed, residents pin sightings on a map, and the owner follows them on a timeline.

It is **not** a rescue or Barangay feature:
- it never creates a rescue mission;
- it never endorses the report to the Barangay;
- it never tracks anyone.

The Lost Pet Report itself keeps its normal workflow, including Barangay endorsement if official help is needed.

## Workflow

> **Changed 2026-11-11.** A missing pet's notice is no longer requested by the owner and activated by the Leader: the Lost Pet report publishes it when it is filed, nobody approves it, and the old Leader button **Mark Resolved – Pet Reunited** (`POST /lost-pet-alerts/{id}/reunited`) is gone. Recovery is only the owner's confirmation. The whole flow, with the rules the code enforces, is in [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md). The numbered steps below are the current flow; the rest of this document (map, timeline, pins, found animals) still applies.

1. **The resident files a Lost Pet Report** for one of their registered pets (a pet must be registered first, see [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md#registration-first-lost-pet-reports-2026-11-11)). In the same transaction the server creates the case and the pet snapshot, **creates and publishes the Community notice**, marks the pet "Lost", writes the history lines and notifies. There is no alert request and no contact-preference choice on the form; a retried filing (same `client_request_id`) returns the first report. Found-animal notices still go through a request and the subdivision's publication setting.
2. **Neighbours see the notice** in Community (a short overview, then a directory searched and paged on the server) and can report an ordinary sighting or say they may have the pet safely.
3. **"I saw this pet"** (`POST /lost-pet-alerts/{id}/sightings`, multipart):
   - **Location:** a pin placed on the map, or the device location. The device location is read once, after the resident agrees in StraySafe and the browser asks for permission.
   - **Sighting time:** defaults to now and can be set earlier.
   - **Optional:** a nearby place label, observations and a photo.
   - **Required:** a confirmation that the information is accurate.
4. **The system records the sighting.** The resident's reported time (`seen_at`) and the server's submission time (`submitted_at`) are stored separately and always shown separately. A sighting starts **Not verified**; only the Leader can mark it verified or dismissed, and who did and when are kept. A sighting is added to the case activity.
5. **Only the owner is notified** ("New Lost Pet Sighting!", `lost_pet_sighting`; it opens the notice's sightings). An ordinary sighting creates no conversation and no Leader task or notification. Open pages refresh on their own (every 15 seconds on the alert page, plus on focus and after saves).
6. **"I may have this pet safely with me"** (the same endpoint with `sighting_type=secured`, a private `care_note` and the writer's `contact_choice`) is a **possible recovery**: it tells the owner, opens a conversation (direct messages when both agree, Leader mediation when either asks) and never marks the pet recovered.
7. **Coordination:** phone numbers and addresses are never shared by the system. See [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md#rules-the-code-enforces).
8. **Reunion:** exactly two ways, one operation. The owner says **My pet is home** in the app (with an explicit confirmation), or the Leader records that the owner confirmed by phone or in person (`POST /lost-pet-alerts/{id}/record-recovery`). It records the confirmation, resolves the notice, closes the case ("Missing pet recovered"), puts the pet back to Active, finishes open conversations and follow-ups, and thanks the residents who reported sightings. A Leader cannot declare a recovery alone; a sighting, a lead, a Barangay update or the generic "Close case" never records one.
9. **The notice closes with the case:** any other closing keeps its own reason (`withdrawn`, `merged`, `not_found`, `report_closed`) through the central closure hook (`close_lost_pet_alerts` in `backend/app/utils/case_closure.py`), never `recovered`. New sightings are refused after that. Earlier sightings and history are kept.

   Escalation to the Barangay doesn't close the alert.

The Leader can also **close** a notice without resolving the report (pet not found, other; a reason is required); the case stays open and the notice says it was closed, never that the pet is home. The owner can then ask for it to be published again.

## Data

- **`lost_pet_alerts`:** one per Lost Pet Report. It holds:
  - status: requested, active or closed;
  - last-seen time, place and position;
  - contact preference and the owner's note;
  - the Leader's message;
  - who requested and activated it, and when;
  - the number of residents notified;
  - the close outcome and reason.
- **`lost_pet_sightings`:** one per submission, linked to the alert and the report. It holds:
  - position (latitude `Numeric(10,8)`, longitude `Numeric(11,8)`) and its source (`map_pin` or `device`), plus the place name (`location_label`, up to 255 characters; see **Sighting pin location** below);
  - `seen_at` and `submitted_at`;
  - description, photo and the accuracy confirmation;
  - review status, note, reviewer and time;
  - `client_request_id` (unique), to catch duplicates;
  - (2026-11-11) `sighting_type` (`seen` or `secured`), `on_behalf` (second-hand provenance) and a private `care_note`.
- **`lost_pet_alerts`** also holds (2026-11-11) the recovery record: `recovered_at`, `recovery_source`, `recovery_confirmed_by`, `recovery_recorded_by`, `recovery_recorded_at`, `recovery_note`.
- **`lost_pet_coordinations`** and **`lost_pet_coordination_messages`** (2026-11-11): how the owner and a neighbour who may have the pet get in touch.

Both tables are created at startup (`create_all`) and are also in `Database3.4_subdivision.sql`.

## Rules and validation

- **Lost Pet Reports only.** The report must be open, not merged, and in a subdivision. One alert per report.
- **Sighting pins** must be inside the subdivision's reporting coverage area (the same check as new reports).
- **Sighting times** can't be in the future (5 minutes of grace) or more than 3 days before the report was filed. Times typed by residents are Philippine local time; the submission time comes from the database clock.
- **Duplicates:**
  - resending the same `client_request_id` (a retry) returns the first record;
  - the same resident submitting at the same pin within a minute (a double tap) also returns the first record.
- **Photos** use the existing upload checks (images only). If the photo can't be stored, the sighting is not saved.

## Access and privacy

| Who | Can |
| --- | --- |
| Pet owner | View the alert, map, timeline and exact pins; sees ordinary reporters as "A neighbor" and a possible recovery's writer by first name; confirms "My pet is home" |
| Subdivision Leader (own subdivision), Admin | Update, close without recovery, record the owner's phone or in-person confirmation, review sightings, help with requests, dashboard; the only role given a reporter's full name |
| Residents of the same subdivision | View active alerts and submit sightings. After an alert closes, only residents who reported a sighting can still view it. Reporters appear as "A neighbor" (or "You"). A possible recovery is seen only by its writer, the owner and the Leader. |
| Other subdivisions, Barangay staff | No access: the location history stays within the alert |

Phone numbers, email addresses and home addresses are never part of an alert or a sighting.

**Pins (2026-11-09).** Another resident sees the **area** of the last-seen place and of every sighting (coordinates rounded to 3 decimals of a degree, about 110 m, flagged `generalized` / `coordinates_generalized`), never the pin. Exact pins stay with the Leader, the Administrator, the person who submitted a sighting (their own) and a lost pet's owner. A pin the leader or the owner types (last seen, correction) must be inside the reporting coverage area, checked on the server.

## Screens

- **Residents:** alerts are community notices in the Resident app (`/resident-app/community`, an alert at `/resident-app/community/alert-<id>`, its sightings at `.../sightings`). The legacy `/resident/lost-pets` pages were retired on 2026-11-10. Each alert shows:
  - the alert card;
  - **Report a Sighting** (the Spotted Here form with its own pin map);
  - the **Lost Pet Tracking Map**: a red marker for the last known location and numbered sighting markers (amber, green when verified, blue ring on the latest). Pins are never joined into a route; clicking one opens its details. **Expand map** opens a full-viewport dialog with the same position, zoom, markers, and popup details. Close or Escape returns to the inline map and restores keyboard focus; the page behind the dialog cannot scroll.
  - the **sighting timeline**: last known location first, then sightings by reported time, with the latest submission highlighted.
- **Subdivision Leaders:** notices are managed in the Leader app (`/subd-admin/community`); the legacy `/subd/lost-pet-alerts` pages were retired on 2026-11-10. A notice shows the same view plus its management actions.
- **Subdivision dashboard:** a compact Lost Pet Alerts section with the same stats, active alerts and latest sighting locations.
- **Report pages** (resident and Subdivision): a Neighborhood Alert card with the status, sighting count, latest sighting and a link to the map, plus the request button.
- **Report Location Intelligence and report maps** (added 2026-11-03):
  - The original report location stays as it was ("Last reported sighting").
  - The resident's report page adds a **Most recent neighbor sighting** block beside it while the case is open and the animal isn't in a holding place. It shows the place, the reported time, who reported it (per the access rules above), the verification status, the sighting count, **Show on map** and **Open tracking map**. It is labelled as a neighbor's report, not a confirmed location.
  - "Most recent" means the latest *reported* time, leaving out dismissed sightings. The tracking map's blue ring marks the latest *submitted* sighting; the two are usually the same. The block shows the sighting's map number ("Sighting 2") and the total reported, as on the tracking map.
  - The resident and Subdivision report maps show the **same pins as the tracking map**: the same numbers (by reported time), the same colors (amber not verified, green verified, gray dismissed) and the same blue ring on the latest submitted. Pins are never joined into a route.
  - Both maps take their numbering from `orderedSightings` (`frontend/src/utils/lostPets.ts`) and their icons from `frontend/src/components/LostPets/sightingMarkers.ts`. The data comes from the same alert endpoints and access rules (`useReportSightings`, `mostRecentSighting`, `LatestSightingBlock`). The report's own coordinates are never changed by a sighting.

### Sighting pin location

When a resident places the pin (a map tap or the device location), the form:

- keeps the pin's exact latitude and longitude, which are sent and stored as they are;
- looks up the place name for that point (OpenStreetMap Nominatim reverse geocoding, `utils/geocode.ts`, cached per coordinate, 6 s timeout). The name is built only from that answer (`utils/placeName.ts`): "Near {street}, {area}, {town}, {province}"; without a street, the nearest named place and then the area;
- shows **Location**, **Latitude** and **Longitude** (6 decimals) under the map, with **Copy coordinates**;
- fills the editable **Location name** field with the name; a name the resident types is kept when they move the pin. If no name is found, the field stays empty, a note says so, and the coordinates are still saved;
- ignores a late answer for an earlier pin, so each pin gets only its own name.

The marker popup and **Sighting details** show the same Location, Latitude, Longitude and Copy coordinates (`PinLocationInfo`), read from the stored sighting, so they are unchanged after a refresh. Sightings saved without a name (before this change, or when the look-up failed) get a name looked up from their own stored coordinates, one request at a time; it is shown but not saved. Nothing is a placeholder: without a name, the coordinates are shown on their own.

## Found animals (2026-11-09)

The same alert machinery carries a **found-animal notice** (`lost_pet_alerts.alert_type = found_animal`; every earlier row is `lost_pet`): `POST /lost-pet-alerts/reports/{id}/request` with `{"alert_type": "found_animal"}`, then `POST /lost-pet-alerts/{id}/activate`. It is for a Found / Unidentified Animal case that is not sensitive, open and in a subdivision. The Leader, or the resident who reported the animal, can ask for it; a resident's request waits for the Leader unless the subdivision's publication policy is `immediate` for found animals (never for a sensitive, nuisance or safety case). It has no owner and no registered pet; the person who found the animal is not "the owner" and sees what a neighbor sees. Neighbors see the animal's looks and the area, never its distinguishing marks or the finder's own words (they are how the real owner proves ownership). Sightings work as for a lost pet. Residents claim the animal through `POST /reports/{id}/ownership-claims`, reviewed by the Subdivision Admin; a claim never establishes ownership. Closing the case closes the notice. Details: [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md).

## Code and tests

- **Backend:**
  - `backend/app/models/lost_pet_alert.py`;
  - `backend/app/routes/lost_pet_alerts.py` (prefix `/lost-pet-alerts`);
  - the closure hook in `backend/app/utils/case_closure.py`;
  - push categories and links in `backend/app/utils/push_categories.py`.
- **Frontend** (the components below are the original implementation; the legacy pages were retired on 2026-11-10 and the current Resident and Leader files are listed in [LOST_PET_LIFECYCLE.md](LOST_PET_LIFECYCLE.md#files)):
  - `frontend/src/utils/lostPets.ts`;
  - `frontend/src/utils/placeName.ts` (place names and coordinate format);
  - `frontend/src/components/LostPets/` (`LostPetAlertView`, `LostPetTrackingMap`, `SpottedHereForm`, `PinLocationInfo`, `usePlaceNames`, `LostPetAlertSummary`, `LostPetDashboardSection`);
  - pages `ResiLostPets.tsx` and `SubdLostPetAlerts.tsx`;
  - routes, navbar and sidebar entries, notification routing.
- **Tests:**
  - `backend/tests/test_lost_pet_sighting_ping.py` (51 checks);
  - `frontend/tests/lostPets.test.mjs` and `frontend/tests/placeName.test.mjs`;
  - `frontend/tests/lostPets.browser.mjs` with `frontend/tests/fixtures/lostPets.tsx` (reverse geocoding is answered locally with synthetic names).
