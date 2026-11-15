# DFD Guide Update: Remove Barangay / External Authorities Entity Box

- **Date:** 2026-11-13 12:40 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `dfd.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-13_1240_dfd-remove-external-entity-barangay.md`
- **Authorization:** User explicit request: "I think in theh dfd i shouldnt mention brgy even though its just external entity"
- **Type:** Polish

## Intent

Remove the External Authorities / Barangay entity box and Barangay wording from the DFD diagrams in `dfd.md` so that only the 3 actual system access roles (`Residents`, `Subdivision Leaders – Subdivision Head & HOA Officers`, and `System Administrator – Role 4`) appear as External Entities, preventing any confusion during capstone defense that Barangay is a system actor or portal.

## Key changes

- Updated `dfd.md`:
  - Removed the `External Authorities` external entity box from **DFD Level 0 (Context Diagram)**, **Subdivision Leader Level 1 DFD**, and **System-Wide 5-Module Level 1 DFD**.
  - Modeled external referral logging strictly as an input/output data flow of **Subdivision Leaders** through `Process 2.6 (Log External Responder Referrals & Record Field Outcomes)` into `D8: External Referrals & Claims`.
  - Replaced "Barangay" mentions in DFD process and arrow labels with generic "External Responder Referral" wording, keeping physical SQL table names isolated to the database mapping table in Section 2.
  - Added a defense rationale note explaining why non-account participants who do not cross the software boundary are excluded as External Entities.
- Updated `docs/README.md` to index this change record.

## Validation evidence

- Verified `dfd.md` diagrams and process tables contain only the 3 active system roles (`Residents`, `Subdivision Leaders`, `System Administrator`) and zero Barangay references in any Mermaid diagram or DFD flow label.

