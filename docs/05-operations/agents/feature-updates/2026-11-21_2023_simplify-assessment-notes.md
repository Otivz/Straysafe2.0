# Simplify Assessment Notes

- **Date:** `2026-11-21 20:23 (UTC)`
- **AI tool:** `Antigravity (Gemini)`
- **Files changed:** `frontend/src/admin/pages/case/AssessmentTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_2023_simplify-assessment-notes.md`
- **Authorization:** User request — FEATURE 10: SIMPLIFY ASSESSMENT NOTES ("Reduce the number of visible notes fields without losing the information recorded by the Leader.")
- **Type:** `Feature`

## Summary

- Inspected all four assessment note fields in `frontend/src/admin/pages/case/AssessmentTab.tsx`:
  - Primary **Assessment notes** (`f.notes` -> `notes`)
  - **Urgency notes** (`f.urgencyNote` -> `urgency_note`)
  - **Identification notes** (`idForm.note` -> `identity.note`)
  - **Ownership verification notes** (`ownForm.note` -> `ownership.note`)
- Kept the primary **Assessment notes** (`Notes`) field directly visible at the bottom of the Quick Assessment (`IncidentSection`) panel.
- Placed the specialized **Urgency notes**, **Identification notes**, and **Verification notes** fields inside expandable **"Add a Note"** toggles in their respective sections.
- Automatically expanded each specialized note section when a previously saved note exists (`urgencyNoteOpen`, `identityNoteOpen`, `ownershipNoteOpen`) or when validation requires a note (`isAutoUrgent && f.urgency !== 'immediate'`, `idForm.status === 'identified'`, or `ownForm.status` in `'confirmed' | 'disputed' | 'unconfirmed'`).
- Preserved all distinct backend fields (`notes`, `urgency_note`, `identity.note`, `ownership.note`) without merging `urgency_note` into `notes`, and ensured saving the primary `Notes` field never overwrites any specialized note.
