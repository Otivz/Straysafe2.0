# Holding place, custody and leader-view rules

Status: Current code behavior, verified with isolated API tests and synthetic browser fixtures on 2026-10-30.

## Names and existing data

Visible interface text and newly generated messages use Holding Place. Internal routes, table/column names and map-category keys retain their existing identifiers. Historical notes and location-label detection recognize both Holding Facility and Holding Place; existing stored names and history are not rewritten.

Category `4` is labelled Roaming Animal in the updated forms, filters, report/chat labels and `Database3.3.txt` seed. This phase did not inspect or update the configured database. Database-sourced category names may retain earlier wording until a separately approved data update. Never reset the database just to apply the label.

## Leader holding view

The Subdivision Leader holding page opens on At Barangay and lists animals currently held at a Barangay place in the leader's Barangay, including animals from its other subdivisions. Rows identify their source subdivision and retain current treatment/healthy/adoption/impound status.

- Lists and metrics derive the leader's Barangay/subdivision from the authenticated account. Caller-supplied subdivision, Barangay, facility and report filters cannot broaden that scope.
- Detail reads allow the leader's own subdivision records or Barangay-held records within the account's Barangay. A leader without an assigned subdivision receives no holding list.
- Barangay-held records are view-only for leaders: holding updates, care-log writes, deletion, transfers and report-status edits do not become available through this view.
- Earlier own-subdivision pen records remain accessible and manageable through their existing permitted actions. The Earlier Subdivision Pen tab, facility picker, occupancy and stay-limit controls appear only while relevant active pen records remain.
- Past records remain accessible. The new view does not delete earlier records, facilities or their history.
- The dashboard's At Barangay count includes the leader's held Barangay animals, including impounded animals that remain held, and excludes earlier pens and discharged/closed cases.

The new view does not change existing Barangay/adoption stage authority. Barangay adoption promotion, catalog reservations, assignments, two-way handover, monitoring and certificates remain part of the system.

## New pen restrictions and custody

Subdivision Leaders can register ordinary landmarks and retain or turn off an existing pen designation. They cannot create a new holding designation, convert an ordinary landmark to a pen, change a landmark's jurisdiction, create a new holding admission or place/relocate an animal into a new facility through report-status requests. The server enforces these restrictions as well as the hidden controls. Administrators and authorized Barangay flows retain their existing functions.

Secured by Resident means the animal is still with the resident/rescuer. The status modal preserves an eligible open case status instead of setting Under Observation (`7`), omits facility metadata and hides facility-placement choices for an unheld animal. It does not offer resident custody for an animal already held in a facility.

The status endpoint rejects contradictory resident/facility requests, including status `7`/`8`, an explicit facility or an existing active holding admission. Valid resident-care updates do not create a holding record, relocate the sighting or choose a default facility. Existing escalation/assignment authorization still applies.

This phase does not implement the separate three-day owner-follow-up workflow; that is Phase 3 onward in the restoration checklist.

## Single-animal records and shared buttons

An ordinary report with one animal hides the Animals in this report panel and split controls while retaining authorized close-up photo replacement. Multi-animal/group reports keep their controls. Accepted trade-off: a report submitted as one animal can no longer be split from that hidden panel if its count was wrong.

The status modal uses the shared orange primary Button for registration and confirmation actions. Other roles' status meanings, disabled states and intentional photo overlays retain their purpose.

## Verification and review limits

Isolated checks cover leader scope/filter bypasses, detail access, read-only writes, earlier pens, resident custody, designation boundaries and retained Barangay adoption promotion. Existing holding privacy, stay-clock, report-edit authorization and adoption catalog/handover checks also pass. Browser fixtures exercise mobile/desktop views, settings, single/multiple-animal panels, custody submission and adoption controls without backend requests. See [Testing](../04-testing/README.md) for commands and results.

Live database contents, native Android behavior and a complete live adoption run were not exercised. No schema migration, database reset, environment/dependency change or deployment was performed.

Before release, recommend a scoped API-layer authorization review because this phase expands holding-read scope and restricts writes. Evidence should include the account/role and filter matrix, response fields, direct mutation paths and unchanged adoption authority. The worksheet command is `npx @ghostbyte/agent-docs-kit@latest security worksheet api-layer`. No worksheet or security sign-off was created by this implementation.
