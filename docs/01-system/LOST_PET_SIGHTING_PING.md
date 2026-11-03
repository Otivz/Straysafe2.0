# Neighbor-to-Neighbor Lost Pet Sighting Ping

**Status:** Current (2026-11-02)

Neighbor-to-Neighbor Lost Pet Sighting Ping helps residents of a subdivision find a lost pet together. A Subdivision Leader broadcasts a Neighborhood Alert, residents pin "Spotted Here" sightings on a map, and the owner follows them on a timeline.

It is **not** a rescue or Barangay feature:
- it never creates a rescue mission;
- it never endorses the report to the Barangay;
- it never tracks anyone.

The Lost Pet Report itself keeps its normal workflow, including Barangay endorsement if official help is needed.

## Workflow

1. **The resident files a Lost Pet Report** from My Pets. The form has a **Request a Subdivision Neighborhood Alert** option, ticked by default, and a contact preference: "Message me through StraySafe" or "Through the Subdivision Leader".
   - The report is filed first. The alert request is a separate call, so a failure never loses the report; the confirmation tells the owner which happened.
   - The owner can also request the alert later from the report page.
2. **The Subdivision Leader reviews it.** They are notified (`lost_pet_alert_request`) and the request appears on the Lost Pet Alerts page and the report page. The Leader can also prepare an alert from the report; it still belongs to the pet's owner.
3. **The Leader activates the alert** (`POST /lost-pet-alerts/{id}/activate`), optionally with a message. Only the subdivision's own Leader or an Admin can do this.
   - Every active resident of that subdivision except the owner gets an in-app (and push) notification `lost_pet_alert`. It includes the pet's name, appearance, last-seen place and time, and asks them to open the alert and tap **Report a Sighting**.
   - The owner is told how many residents were notified.
   - The report's history records the broadcast.
4. **Residents submit "Spotted Here"** (`POST /lost-pet-alerts/{id}/sightings`, multipart):
   - **Location:** a pin placed on the map, or the device location. The device location is read once, after the resident agrees in StraySafe and the browser asks for permission.
   - **Sighting time:** defaults to now and can be set earlier.
   - **Optional:** a nearby place label, observations and a photo.
   - **Required:** a confirmation that the information is accurate.
5. **The system records the sighting.** The resident's reported time (`seen_at`) and the server's submission time (`submitted_at`) are stored separately and always shown separately. A sighting starts **Not verified**; only the Leader can mark it verified or dismissed.
6. **The owner and the Leader are notified:** "New Lost Pet Sighting!" (`lost_pet_sighting`), with the place, the sighting time and the report date. Open pages refresh on their own (every 15 seconds on the alert page, plus on focus and after saves) and announce a new sighting.
7. **Coordination:** the alert shows the owner's preferred contact method. Phone numbers and addresses are never shown.
8. **Reunion:** the owner uses the existing **Pet Recovered** button, or the Leader verifies and clicks **Mark Resolved – Pet Reunited** (`POST /lost-pet-alerts/{id}/reunited`). The Leader's action:
   - sets the report to Claimed by Owner (9), custody "Reunited with Owner";
   - creates the owner-return record, the same as Pet Recovered;
   - adds a history entry "Resolved – Pet Reunited";
   - thanks the residents who reported sightings.
9. **The alert closes with the report:** any closing status closes the open alert through the case-closure hook (`close_lost_pet_alerts` in `backend/app/utils/case_closure.py`). Claimed, Released or Resolved closes it as *reunited*; any other closing status closes it as *report closed*. New sightings are refused after that. Earlier sightings and history are kept.

   Escalation to the Barangay doesn't close the alert.

The Leader can also **close** an alert without resolving the report (pet not found, not broadcast, other; a reason is required). The owner can then request it again.

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
  - `client_request_id` (unique), to catch duplicates.

Both tables are created at startup (`create_all`) and are also in `Database3.3.txt`.

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
| Pet owner | Request; view the alert, map, timeline and reporter names |
| Subdivision Leader (own subdivision), Admin | Activate, update, close, mark reunited, review sightings, dashboard; sees reporter names |
| Residents of the same subdivision | View active alerts and submit sightings. After an alert closes, only residents who reported a sighting can still view it. Reporters appear as "A neighbor" (or "You"). |
| Other subdivisions, Barangay staff | No access: the location history stays within the alert |

Phone numbers, email addresses and home addresses are never part of an alert or a sighting.

## Screens

- **Residents:** there is no standalone list; `/resident/lost-pets` redirects to the resident home, and alerts are opened from the report page or a notification. Each alert (`/resident/lost-pets/:id`) shows:
  - the alert card;
  - **Report a Sighting** (the Spotted Here form with its own pin map);
  - the **Lost Pet Tracking Map**: a red marker for the last known location and numbered sighting markers (amber, green when verified, blue ring on the latest). Pins are never joined into a route; clicking one opens its details.
  - the **sighting timeline**: last known location first, then sightings by reported time, with the latest submission highlighted.
- **Subdivision Leaders:** `/subd/lost-pet-alerts` redirects to the Subdivision dashboard; each alert (`/subd/lost-pet-alerts/:id`, opened from the report page, the dashboard section or a notification) shows the same view plus its management actions.
- **Subdivision dashboard:** a compact Lost Pet Alerts section with the same stats, active alerts and latest sighting locations.
- **Report pages** (resident and Subdivision): a Neighborhood Alert card with the status, sighting count, latest sighting and a link to the map, plus the request button.

### Sighting pin location

When a resident places the pin (a map tap or the device location), the form:

- keeps the pin's exact latitude and longitude, which are sent and stored as they are;
- looks up the place name for that point (OpenStreetMap Nominatim reverse geocoding, `utils/geocode.ts`, cached per coordinate, 6 s timeout). The name is built only from that answer (`utils/placeName.ts`): "Near {street}, {area}, {town}, {province}"; without a street, the nearest named place and then the area;
- shows **Location**, **Latitude** and **Longitude** (6 decimals) under the map, with **Copy coordinates**;
- fills the editable **Location name** field with the name; a name the resident types is kept when they move the pin. If no name is found, the field stays empty, a note says so, and the coordinates are still saved;
- ignores a late answer for an earlier pin, so each pin gets only its own name.

The marker popup and **Sighting details** show the same Location, Latitude, Longitude and Copy coordinates (`PinLocationInfo`), read from the stored sighting, so they are unchanged after a refresh. Sightings saved without a name (before this change, or when the look-up failed) get a name looked up from their own stored coordinates, one request at a time; it is shown but not saved. Nothing is a placeholder: without a name, the coordinates are shown on their own.

## Code and tests

- **Backend:**
  - `backend/app/models/lost_pet_alert.py`;
  - `backend/app/routes/lost_pet_alerts.py` (prefix `/lost-pet-alerts`);
  - the closure hook in `backend/app/utils/case_closure.py`;
  - push categories and links in `backend/app/utils/push_categories.py`.
- **Frontend:**
  - `frontend/src/utils/lostPets.ts`;
  - `frontend/src/utils/placeName.ts` (place names and coordinate format);
  - `frontend/src/components/LostPets/` (`LostPetAlertView`, `LostPetTrackingMap`, `SpottedHereForm`, `PinLocationInfo`, `usePlaceNames`, `LostPetAlertSummary`, `LostPetDashboardSection`);
  - pages `ResiLostPets.tsx` and `SubdLostPetAlerts.tsx`;
  - routes, navbar and sidebar entries, notification routing.
- **Tests:**
  - `backend/tests/test_lost_pet_sighting_ping.py` (51 checks);
  - `frontend/tests/lostPets.test.mjs` and `frontend/tests/placeName.test.mjs`;
  - `frontend/tests/lostPets.browser.mjs` with `frontend/tests/fixtures/lostPets.tsx` (reverse geocoding is answered locally with synthetic names).
