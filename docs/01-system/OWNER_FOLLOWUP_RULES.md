# Owner follow-up and observation rules

Status: Current code behavior, verified with isolated backend test suite on 2026-10-31.

## Scope and initiation

The owner follow-up (observation) workflow allows Subdivision Leaders to place an owned pet and its owner under formal community observation without impounding the pet or initiating an unneeded rescue request.

- **Authorized Actors:** Only Subdivision Leaders (role 2) or Administrators (role 4) can initiate a follow-up observation.
- **Jurisdiction Boundary:** Subdivision Leaders may only initiate observations on reports originating within their assigned subdivision (`actor.subdivision_id == report.subdivision_id`).
- **Eligible Cases:** The report must be open, individually identified, not closed/resolved, not a merged duplicate, and not escalated to Barangay.
- **Rabies Exclusion:** Reports exhibiting suspected rabies (in condition, description, AI behavioral explanation, or risk assessment) cannot be placed under observation and must be escalated immediately.
- **Staff Caution Signals:** High priority reports, confirmed bites, injury history, or aggressive behavior signals display a cautionary warning in staff views to ensure containment is verified.
- **Custody Independence:** Putting an animal on owner observation does not assign facility custody, create a holding intake, or alter adoption readiness. Animals already held in a holding place are ineligible for owner follow-up.

## Observation duration and single extension

- **Window:** An observation started by a **warning** runs for the period of the confirmed policy the warning was issued under; a policy that defines none starts no observation (nothing is assumed). A manually started observation (`POST /owner-followups/`) uses the administrator's default, `owner_followup_default_duration_days`, which is 3 days until it is set. Observations of warnings issued before policies existed are read as the 3 days that applied then. See [OWNER_WARNING_RULES.md](OWNER_WARNING_RULES.md).
- **Settings Stability:** Modifying the system setting changes the default for subsequent follow-ups; it never alters or overwrites the saved `due_at` timestamp of existing observations.
- **Single Reasoned Extension:** Leaders may grant at most one extension during an active observation. An explicit `extension_reason` is required. Attempting a second extension is rejected with HTTP 400.
- **Non-Automatic Expiry:** Reaching the observation deadline does not silently close or escalate the case. Instead, it transitions to due/overdue status and triggers notifications for the handling leader to review compliance.

## Concurrency and repeat protection

- **Single Active Observation Per Pet:** The system prevents simultaneous open observations on the same registered pet across different reports. Starting a new observation on a pet that is already under observation is rejected with HTTP 409.
- **Single Active Observation Per Report:** A report cannot carry more than one active follow-up observation at a time.

## Owner support and privacy

- **Account & Offline Owners:** Both registered residents with app accounts and unregistered/offline owners (recorded with name, phone, and address) are supported.
- **Acknowledgement:** Registered owners can formally acknowledge the observation notice via the app; staff can log verbal/phone acknowledgements on behalf of offline owners.
- **Owner Updates:** Owners can submit progress notes and optional photo proof verifying containment.
- **Privacy & Redaction:** Private owner contact information and internal staff notes/contact logs are redacted from regular citizens and unauthorized viewers.

## Monitoring logs (Under Observation page)

- **Storage:** Each **Add Monitoring Log** submission (the legacy Under Observation page, retired 2026-11-10; the endpoint remains) is one row in `followup_contact_logs`, the same table that holds staff contact logs. A row records `followup_id` (the observation), `report_id`, `pet_id` (the animal, when linked), `logged_by` (staff user), `inspection_method`, `inspection_outcome`, `notes`, and server-side `created_at` / `contact_date` timestamps. Logs written before these columns existed have `NULL` method and outcome; their `contact_type` is shown instead.
- **API:** `POST /owner-followups/{followup_id}/logs` creates a log (201) and returns the saved row; `GET /owner-followups/{followup_id}/logs` lists them newest first. The Under Observation dashboard returns the same rows as `contact_logs` on each item.
- **Allowed values:** method is `observation`, `in_person`, `phone`, or `other`; outcome is `pet_secured`, `spoke_with_owner`, `pet_still_roaming`, `no_answer`, or `other`. Notes are required (1–2000 characters after trimming).
- **Who:** Subdivision Leaders (own subdivision only) and admins can add logs. Barangay staff can read logs for subdivisions in their barangay. Residents cannot read or add them.
- **Duplicate protection:** The form sends a `client_request_id` per draft (unique column). Re-sending the same key returns the saved row with 200 instead of inserting again; the key is kept after a failed save, so a retry cannot create a duplicate.
- **Append-only:** There is no edit or delete endpoint. Logs are kept when the case is resolved or endorsed to Barangay. New logs are refused (409) once the observation is complied, closed, or cancelled, or the report is resolved (status 11).
- **No workflow side effects:** Adding a log does not change `due_at`, which stays based on the First Warning, and does not change the observation status. Only verified resolution, Second Warning, or endorsement actions move the case.
- **Schema upkeep:** `ensure_followup_monitoring_log_columns()` in `backend/app/main.py` adds the columns, indexes, and foreign keys at startup without touching existing rows, and links older rows to their observation's report and animal.

## Owner observation updates

- **Flow:** First Warning issued → an observation of the policy's period starts (the owner is notified: "<N>-Day Observation Period Started") → the owner submits updates → subdivision staff review them → staff verify compliance. Owner updates and staff monitoring logs are separate records shown in separate sections.
- **Where:** Owners used **Observation Updates** (`/resident/observations`) and staff the **Owner Observation Updates** section of the legacy case page; both screens were retired with the legacy portals on 2026-11-10. The endpoints, rules and notifications described here are unchanged; the Resident and Leader apps have no such screen yet.
- **Storage:** `owner_observation_updates` holds one row per submission: `followup_id`, `report_id`, `pet_id`, `owner_user_id`, `compliance_status`, `owner_remarks`, a unique `client_request_id`, and server-side `submitted_at` / `created_at`. Photos are uploaded by the backend to Cloudinary (`straysafe/observation_updates`) after signature checks (JPG/PNG/WEBP, max 10 MB, max 5); their URLs are stored in `owner_observation_update_photos`. The client never supplies a URL or an owner id.
- **API:** `GET /owner-followups/my-observations` (the signed-in owner's records); `POST /owner-followups/{id}/owner-updates` (multipart: `compliance_status`, `owner_remarks` 3–2000 chars, `client_request_id`, `photos[]`); `GET /owner-followups/{id}/owner-updates`; `POST /owner-followups/{id}/owner-updates/{update_id}/review` (`review_remarks` optional). Owner updates also appear as `owner_updates` on every follow-up response for staff and the owner.
- **Compliance values:** `issue_resolved`, `improving`, `still_addressing`, `unable_to_comply`.
- **Who:** Only the follow-up's `owner_id` can submit or read their updates; anyone else gets 404. Subdivision Leaders (own subdivision) and admins can read and review. Barangay staff can read updates for their barangay but not review them.
- **Append-only and review:** Owner fields are never edited and there is no edit or delete route. A review sets `reviewed_at`, `reviewed_by`, and `review_remarks` once (a second review is refused, 409). Reviewing is not verification: it does not change status.
- **No workflow side effects:** An owner update, including "Issue Resolved", does not change `due_at`, does not resolve or close the case, and does not block Second Warning eligibility. Updates are refused (409) once the observation is no longer `observing` or the report is resolved, and all updates are kept after resolution or endorsement.
- **Duplicate protection:** Re-sending the same `client_request_id` returns the saved update (200) without re-uploading photos.
- **Notifications:** Owner: observation started (with the First Warning), a one-time reminder to submit an update if none was sent within 24 hours, the existing 24-hour deadline reminder, update received, case resolved, and Second Warning issued. Leader: new owner update (titled "with Photo Evidence" when photos are attached), "Owner Reports Issue Resolved", and "Observation Expired: Non-Compliant" when the deadline passes without verified resolution. Follow-up notifications are now committed after the action they report on (previously they were added after the final commit and never saved).
- **Audit:** Each submission and review writes an `audit_logs` entry (`SUBMIT_OWNER_OBSERVATION_UPDATE`, `REVIEW_OWNER_OBSERVATION_UPDATE`).
- **Legacy field:** `POST /owner-followups/{id}/owner-update` (single `owner_notes` / `owner_photo_url`, overwritten on each call) is no longer used by the UI and is kept only for compatibility.

## Lifecycle and case closure integration

- **Referral display (Phase 4):** The observation-day and endorsement-status captions say "Referred to Barangay <name>". The name comes from the recorded referral recipient, falling back to the subdivision's Barangay for an older case without a referral row; if neither is known, the caption says "Referred to the Barangay". Barangay work is labelled as outside StraySafe. This is display enrichment only; observation states, warning rules, deadlines and transitions are unchanged.

- **Centralized Closure Hook:** When a report transitions to a closed status (`CLOSED_REPORT_STATUS_IDS`) or is escalated to Barangay (Status 13), any active follow-up observation is ended consistently with a recorded closure reason.
- **Deduplicated Due Notices:** The background operations watcher checks approaching deadlines and dispatches 24-hour reminder notices to owners and due notices to leaders without duplicate deliveries.
