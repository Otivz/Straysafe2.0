# Pet registration and match review

Status: Current. Verified against the Phase 5 restoration on 2026-10-30.

## Photo analysis

Pet registration sends `purpose=pet` to `POST /reports/analyze-media`. It uses the local YOLO detector and local color extraction, without calling Gemini or returning an authenticity verdict. A successful scan returns `animal_detected` as true or false; detector failure returns null. The forms refuse a successful negative result and wait for an in-progress check. An unavailable detector does not itself prevent registration.

The resident form quietly suggests supported species and colors. It does not infer breed or size, advertise authenticity verification, or copy inferred pattern text into Specific Markings. Fields remain editable. Staff use the same photo guard. Multiple animals require cropping and checking the crop, or a confirmed count override with a reason; the server still validates and audits override metadata. Original-photo registration sessions and front/left/right photos remain supported.

These are form checks, not a new server-side proof of photo authenticity. Pet create/edit/photo routes no longer schedule Gemini background authenticity rechecks. Historical photo-check fields and records are retained, but the obsolete verdict banner is hidden. Ordinary report analysis, report photo checks, matching services and adoption identity-document processing retain their existing behavior.

## Registration fields and history

Coat Pattern and Specific Markings are separate inputs. The existing combined storage format is retained; its parser removes placeholder and pattern-only filler such as `Tricolor coat` from the Specific Markings input while preserving real details such as scars. No migration or bulk rewriting of old records is required.

Approximate ages still advance from their stored birth date. Empty age inputs remain unknown. Redundant approximate-age banners, AI badges, file-analysis labels and size/weight annotations have been removed. Resident bite/chasing declaration checkboxes are hidden; existing declaration values are loaded and retained on edit. Staff controls and server protections against reducing verified incident history remain in place.

## Registration before a Lost Pet report (2026-11-11)

A resident registers a pet before they can report it missing: the Lost Pet report uses the registered profile and adds only when and where the pet was last seen. Registration is what the owner declared. It does not verify ownership, and it is not required for any other report. Dogs and cats can be registered for now (the database enum); a resident cannot set the owner, who registered the record, a verification flag or the status; photo addresses must be the subdivision's own uploads. A record the subdivision office entered for an owner is linked to the resident's account by the Leader (`POST /pets/{id}/assign-owner`, with how they checked), and it joins the resident's pets only when the resident confirms. The rules and the screens are in [CASE_WORKFLOW_BACKEND.md](CASE_WORKFLOW_BACKEND.md#registration-first-lost-pet-reports-2026-11-11) and [NEW_INTERFACES_INTEGRATION.md](NEW_INTERFACES_INTEGRATION.md#lost-pet-reports-registration-first-2026-11-11).

## Matches and claims

Side-by-side comparison displays physical patterns, markings and observed conditions. Structured custody and encounter notes are omitted from this comparison; full report views retain their descriptions. Unstructured legacy descriptions remain visible as legacy free text. The redundant AI header and staff owner-verification prompt are removed; identity confirmation, dispute, reversal and owner actions remain available under their existing rules.

Staff match responses can include `claim_id` and `claim_status` for a filed, eligible claim for the same pet and case. Lookup includes merged reports and follows merged claim aliases, but rejects aliases leading outside that case or to another pet. Rejected and unfiled potential matches have no shortcut. Existing match jurisdiction checks still apply; residents receive no staff claim metadata.

Subdivision and Barangay staff can open the filed claim from the match list or review modal. Both claims pages support `?claim_id=N`, open the linked review once, and keep it closed after dismissal during background refresh. Staff review remarks start empty; refreshing does not replace a typed draft. Owner notes remain separate, except the legacy canned `I confirm this is my pet.` text is suppressed. Citizen confirmation no longer generates that sentence when no remarks were entered. Evidence upload and claim decisions retain their existing rules.

## Adoption compatibility and validation

Adoption routes, catalog, applications, ownership locks, pet adoption indicators, assignments, chat, handover, certificates and monitoring are retained. Pet ownership assignment remains blocked where adoption determines ownership. No configured database changes, migrations, dependency changes or deployments are required by this phase.

See [Phase 5 validation and commands](../04-testing/README.md). Evidence uses isolated SQLite and synthetic browser fixtures, not live Gemini, Cloudinary, identity documents or production data. Real detector accuracy, physical Android behavior and live uploads remain unverified.

Because match responses now carry additional staff claim metadata, a focused API-layer security review is recommended before release. Examine jurisdiction enforcement, resident redaction and merged-case authorization using the scoped tests as evidence. Worksheet command: `npx @ghostbyte/agent-docs-kit@latest security worksheet api-layer`. No security worksheet or security pass is asserted here.

## Shared pet-record attribution after Barangay retirement - 2026-11-06

Admin and Subdivision pet histories use Not recorded when a warning has no issuer name. They retain a genuinely recorded issuer name and role, including earlier Barangay staff, and do not rewrite the warning. Synthesized current status-4 captions use Referred to Barangay. The unassigned-owner guidance states that Barangay adoption work happens outside StraySafe. Earlier adoption origins, recorded adopter names and existing ownership/adoption locks remain intact.
