# Holding place, custody and leader-view rules

Status: Current subdivision-only boundary updated 2026-11-06. Later custody/adoption operational details describe retained legacy compatibility behavior, gated off by default; the 2026-10-30 verification remains historical evidence.

## Names and existing data

Visible interface text and newly generated messages use Holding Place. Internal routes, table/column names and map-category keys retain their existing identifiers. Historical notes and location-label detection recognize both Holding Facility and Holding Place; existing stored names and history are not rewritten.

Category `4` is labelled Roaming Animal in the updated forms, filters, report/chat labels and `Database3.3.txt` seed. This phase did not inspect or update the configured database. Database-sourced category names may retain earlier wording until a separately approved data update. Never reset the database just to apply the label.

## Current holding access

The active Subdivision holding/claims URLs redirect to external referrals. The subdivision dashboard has no holding/claims/rescue queues or operational shortcuts. The Admin Holding Archive page and navigation entry are removed; its old `/admin/holding-facility` URL redirects to `/admin/incidents`. The Adoption Archive remains read only. Holding records remain readable inside related reports through existing read APIs; no historical holding data is deleted. Actual earlier custody and its recorded locations stay readable; external referral updates do not establish custody.

Operational admission, impound and adoption actions belong to the retired legacy system. The legacy switch exists for compatibility testing; it does not create a Barangay account or active holding workflow in the default subdivision-only portal.

## New pen restrictions and custody

By default, both Administrators and Subdivision Leaders can register ordinary reference landmarks and edit permitted existing reference metadata, but cannot create a holding designation or convert an ordinary landmark into one. The landmark create/update routes apply the existing retirement gate to both `is_holding_facility` and the `facility` category, before any write. Historical designations and their saved types remain readable and may be retained during permitted metadata edits. Leader jurisdiction restrictions still apply. `BARANGAY_WORKFLOWS_ENABLED=1` preserves the existing Admin legacy facility behavior; it does not relax the pre-existing leader jurisdiction/new-pen restrictions.

Secured by Resident means the animal is still with the resident/rescuer. The status modal preserves an eligible open case status instead of setting Under Observation (`7`), omits facility metadata and hides facility-placement choices for an unheld animal. It does not offer resident custody for an animal already held in a facility.

The status endpoint rejects contradictory resident/facility requests, including status `7`/`8`, an explicit facility or an existing active holding admission. Valid resident-care updates do not create a holding record, relocate the sighting or choose a default facility. Existing escalation/assignment authorization still applies.

This phase does not implement the separate three-day owner-follow-up workflow; that is Phase 3 onward in the restoration checklist.

## Subdivision Leader wording

Subdivisions have no holding facility, shelter, pound or kennels. A found animal is either kept by a resident or finder (**Secured by Resident**, shown as temporary community care), or picked up by Barangay responders and brought to the **Barangay Holding Facility**. The Subdivision Leader screens say so:

- **Status modal:** the secured option for a subdivision case reads "Temporary Community Care". The animal "is kept by a resident or finder until Barangay responders pick it up". The fallback note says the subdivision has no holding facility.
- **Holding page:**
  - Earlier subdivision pen records are under **Earlier Community Care Records**, worded as records.
  - The stay-limit alert and transfer prompt name the **Barangay Holding Facility**.
  - The capacity escalation reason is now "Awaiting Barangay rescue (finder can no longer keep the animal)".
  - The kennel slot field is a "Care spot / slot".
- **Settings:** an earlier landmark designation shows as an **Earlier Community Care Spot**, with its type shown as a care spot. The stored values (e.g. `Temporary Holding Pen`) are unchanged.
- **Pet Claims:** an approved claim is "Ready for Handover to the Owner" / "Awaiting handover", not a pickup or release.
- **Report view, history map and handover modal:** a physical facility is named as the Barangay Holding Facility.

Stored values and statuses are unchanged: `Secured by Resident`, `In Subdivision Facility`, `In Barangay Facility`, `facility_type`, and the report and claim statuses. Only the displayed words changed.

## Single-animal records and shared buttons

An ordinary report with one animal hides the Animals in this report panel and split controls while retaining authorized close-up photo replacement. Multi-animal/group reports keep their controls. Accepted trade-off: a report submitted as one animal can no longer be split from that hidden panel if its count was wrong.

The status modal uses the shared orange primary Button for registration and confirmation actions. Other roles' status meanings, disabled states and intentional photo overlays retain their purpose.

## Holding stay limit (added 2026-11-03)

- **One value for the whole Barangay, stored on the server** (`system_settings`, key `holding_stay_limit_days`). The default is 7 days until it is set; it can be 0 to 90, and 0 means no waiting.
- **Only the Head Officer (Barangay staff with the Head Officer flag) or an Administrator can change it.** They do it on Barangay Settings → Holding Place & Quarantine, which calls `PUT /holding/stay-limit`. Everyone else sees it read-only (`GET /holding/stay-limit`).
- Every change is audited (`UPDATE_HOLDING_STAY_LIMIT`, with old and new values). It applies to every animal from then on, including those already held.
- **Days held** count from the animal's arrival at its current facility (`facility_stay_start`; a move restarts the count).
- **The server enforces the limit** (`require_stay_limit` in `backend/app/utils/holding_stay.py`) on three actions:
  - listing for adoption (`POST /adoptions/promote/{id}`);
  - setting a holding record to For Adoption, Adopted or Impounded directly (`PATCH /holding/{id}`, statuses 6, 7 and 8).
  - A number sent by the browser (`min_stay_days`, `impound_days`) is ignored.
  - An animal already listed for adoption passed the check when it was listed, so moving it on to Adopted or Impounded isn't blocked again.
- **Before the limit:**
  - regular staff are refused (409) with "N of M days held … available on <date>";
  - the Head Officer or an Administrator may act early only with a written reason (`early_reason`, at least 5 characters, otherwise 400);
  - the early action is audited (`EARLY_STAY_LIMIT_OVERRIDE`: who, animal, days held, limit, reason), and the reason is added to the animal's timeline note.
- The overdue and needs-impoundment counts (`GET /holding/metrics`) and the overdue reminder task use the stored limit.
- **Pages** read it with `useStayLimit` (`frontend/src/utils/useStayLimit.ts`):
  - the Holding Facility page shows the limit read-only, a "N of M days held · available on <date>" lock note for regular staff, and a required reason box for early impound and early promotion by the Head Officer or an Administrator;
  - the dashboard and sidebar use the same value.
- Tests: `backend/tests/test_holding_stay_limit.py` and `frontend/tests/holdingStayLimit.browser.mjs`.

## Verification and review limits

Isolated checks cover leader scope/filter bypasses, detail access, read-only writes, earlier pens, resident custody, designation boundaries and retained Barangay adoption promotion. Existing holding privacy, stay-clock, report-edit authorization and adoption catalog/handover checks also pass. Browser fixtures exercise mobile/desktop views, settings, single/multiple-animal panels, custody submission and adoption controls without backend requests. See [Testing](../04-testing/README.md) for commands and results.

Live database contents, native Android behavior and a complete live adoption run were not exercised. No schema migration, database reset, environment/dependency change or deployment was performed.

Before release, recommend a scoped API-layer authorization review because this phase expands holding-read scope and restricts writes. Evidence should include the account/role and filter matrix, response fields, direct mutation paths and unchanged adoption authority. The worksheet command is `npx @ghostbyte/agent-docs-kit@latest security worksheet api-layer`. No worksheet or security sign-off was created by this implementation.

## Reference settings and historical classifications - 2026-11-06

Admin settings describe the external Barangay contact/reference location rather than rescue headquarters or deployment dispatch. Supported landmark registration and reference-pin editing remain available. New forms exclude holding-place categories and designation controls. Editing an earlier place displays its recorded facility type read-only; the UI does not offer replacement shelter/impound types. Existing metadata is retained when updating its name or coordinates. The leader's existing explicit switch-off action for an earlier designation remains available. No schema or stored landmark records were migrated.

Operational stay-limit/custody descriptions elsewhere in this document are historical compatibility details, not permission to operate the retired workflow in default mode. New designation rejection and supported metadata edits are covered by `backend/tests/test_retired_landmark_designations.py`; the earlier facility/map synchronization script is run in an isolated database with the legacy switch enabled.
