# DFD corrections

Reviewed on October 24, 2026 against the application routes, models and utilities. All 29 Mermaid diagrams retain
the requested rounded processes and open-ended data stores with separate grey ID and yellow name compartments.

## Which set to use

- **Main application set:** [`mermaid/`](mermaid/), with ten processes and stores D1–D11. The system-wide Level 1
  diagrams define the parent interfaces; the role diagrams are partial views of those same processes. Each
  two-part role diagram contains the same flows as its full version.
- **Logical alternative:** [`corrected/`](corrected/CORRECTED_DFD.md), with nine processes and its own store
  dictionary. Its boundary includes managed media and supporting delivery/AI facilities. The main set represents
  external providers explicitly. Use one set consistently within a manuscript.
- **Manual system:** [`existing/`](existing/EXISTING_SYSTEM_DFD.md), with shared processes 1.0–4.0 and manual
  stores D1–D2. Manual workflow descriptions come from the supplied manuscript; the review corrects internal
  diagram consistency rather than independently verifying historical operations.

## Corrections applied

| Problem | Correction | Evidence or rationale |
|---|---|---|
| The manual coordination process produced a visit request without input in the barangay view. | Added the recorded assistance request as its input. | Requests already enter D1 in the subdivision-leader view. |
| Manual arrows said “Write Entry”, “Check Status”, “Update Log” and “File Manual Record”. | Replaced action labels with the report, status, rescue or impound records carried by each arrow. | Data flows name information; work belongs inside a process. |
| Manual resolutions written to D2 were unavailable to the views reading D1. | Added the resolution/status update to D1 and the corresponding record reads. | Restores the source for resident and leader status outputs. |
| Several processes returned saved records without reading the relevant store. | Added pet, claim, adoption, message, custody and certificate reads where required. | [`claims.py`](../../backend/app/routes/claims.py), [`adoptions.py`](../../backend/app/routes/adoptions.py), [`chat.py`](../../backend/app/routes/chat.py), [`pet_qr.py`](../../backend/app/routes/pet_qr.py). |
| Level 1 and Level 2 had different external/store interfaces. | Added the missing parent/child exchanges and numbered continuations, including communication events. | Processes 3.0–7.0 now have matching directed boundary connections across levels. |
| All barangay staff appeared able to create personnel accounts. | Identified the Head Officer as the provisioning actor; retained normal staff sign-in. | [`users.py`](../../backend/app/routes/users.py), `create_user` and `admin_create_user`. |
| Leaders appeared limited to viewing holding records. | Added permitted local intake, care and escalation data; documented the barangay-facility restriction. | [`holding.py`](../../backend/app/routes/holding.py), `create_animal`, `update_animal`, `add_timeline_entry`. |
| AI configuration had no saved-setting output and was described as an on/off switch. | Added configuration process 4.6, settings/audit persistence, and mode/rescan results. | [`matches.py`](../../backend/app/routes/matches.py), `update_ai_matching_settings`: Gemini vision or attribute-only mode. |
| Pet linking appeared to depend only on an official's match decision. | Made the joint confirmation requirement explicit and added the owner-response link/history updates. | [`matches.py`](../../backend/app/routes/matches.py), `is_pet_match_fully_confirmed` and `link_confirmed_pet_match`. |
| Certificate validity lacked its saved adoption, certificate and handover inputs. | Added the record read and explained pending-handover validity. | [`adoption_certificates.py`](../../backend/app/routes/adoption_certificates.py), `verify_certificate`. |
| The nine-process alternative omitted announcement/settings storage and public certificate verification. | Expanded D9/D10 descriptions and added the public verification, communication and configuration flows. | Corresponding announcement, settings and certificate routes. |
| Manuscript Level 0 text described a different boundary from the main Level 1 figures. | Aligned the main manuscript text with the ten-process set and its ten external entities. | [`MANUSCRIPT_DFD_LEVEL0.txt`](MANUSCRIPT_DFD_LEVEL0.txt). |

## Validation

Structural checks cover defined nodes, labelled flows, no entity/store bypasses, inputs and outputs for every
internal process, context interfaces, all five Level 1/Level 2 process boundaries, and split/full role consistency.
Embedded Markdown diagrams and flow checklists are synchronized with their Mermaid sources. Browser rendering
checks cover all 29 diagrams, rounded process shapes, and the open-ended store compartments.

The role views intentionally omit other roles' interactions and some secondary implementation details; they are
not independent complete decompositions. Detailed system views may need larger export sizes than the role figures.
