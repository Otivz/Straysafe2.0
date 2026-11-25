# DFD Corrections: No Leader Pin Fix, Case History Instead of Audits

- **Date:** 2026-11-24 16:18 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `STRAY-SAFE-2.0-DFD.md`, `docs/README.md`
- **Authorization:** Developer asked "is it match my dfd process to the current system that i have?"; the check found two mismatches in the diagram updated earlier the same day, which were corrected.
- **Type:** Fix (documentation only)

## Intent

Check the updated proposed-system DFD against the code, and correct what does not match.

## Key changes

- **No Leader pin fix:** the Leader apps have no pin-fix screen, and the backend only has a legacy status-update path. `Pin Fix` and `Pin Flags` were removed from Level 0 and Diagram 3. `2.2` is now `Validate Geofence`: the coverage check reads the centre and radius and returns an `Out-of-Area Notice` to the person filing (Resident or Leader); a new Level 0 label.
- **Case History instead of Audits:** the audit-log endpoint is limited to an administrator role, which the system does not have, so the Leader has no audit screen. `5.3` is now `Show Case History`, built from the case timeline and the audit entries. `Audits` became `Case History` on Level 0.
- The balancing table, the "what changed" list and the section title for Diagram 6 follow.

## Validation evidence

- Code checks: no pin-fix or pin-flag code in `frontend/src/admin`; `routes/audit_logs.py` requires role 4; the resident warning page does have an acknowledge action (that flow stays).
- All 6 diagrams render in a browser. The automatic balance check finds every Level 0 term on a matching Level 1 flow (0 uncovered). All 20 Level 1 processes have at least one input and one output.
- Not checked line by line: the remaining flows, which follow the system documents and the features built and tested in this project.
