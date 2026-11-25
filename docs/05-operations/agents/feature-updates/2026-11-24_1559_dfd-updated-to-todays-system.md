# DFDs Updated to the System as It Works Today

- **Date:** 2026-11-24 15:59 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `STRAY-SAFE-2.0-DFD.md`, `STRAY-SAFE-EXISTING-PROCESS-DFD.md`, `docs/README.md`
- **Authorization:** Developer: "Can you update the [proposed-system DFD and the existing-process DFD] with todays system".
- **Type:** Polish (documentation only)

## Intent

Both Data Flow Diagram files predated the QR tag messages, the owner's answers, the stranger's photo, resident records and applications, and the removal of the Administrator. Bring the proposed-system DFD in line with the current system, and the comparison table of the "before" DFD.

## Key changes

- **`STRAY-SAFE-2.0-DFD.md` (Level 0 and Diagrams 2 to 6):**
  - new external entity `Visitor` (a stranger who scans a QR tag), with its own Level 0 flows;
  - new processes `2.5 Receive QR Tag Message` and `2.6 Answer QR Tag Message`, and `2.4` narrowed to sightings and recovery;
  - `3.3 Assign Case Pathways` replaced by `3.3 Claim Case & Set Priority`, because the code has no pathway step;
  - `3.2` includes the owner's Confirm or Decline;
  - `1.1` and `1.4` cover activation by e-mail link, the official resident list and applications;
  - "Geofence Polygon" became "Geofence Centre & Radius";
  - "Confirmed Owner Transfer" removed from `4.4`, since a claim never changes ownership;
  - `4.2` mentions enforcement steps, `5.2` the Dashboard, and `4.4` scheduled case alerts;
  - a data stores table, a rewritten balancing table, and a list of what changed.
- **Kept as decided earlier:** no AI, no heatmap, no Barangay entity. No Administrator is drawn, and `D5` stays unused.
- **`STRAY-SAFE-EXISTING-PROCESS-DFD.md`:** the diagrams describe the manual past and are unchanged. Section 4 ("Key Gaps Solved") is rewritten for today's system, with new rows for residents and pets, the QR tag messages for finders, notices, referrals, and the Dashboard and audit log.

## Validation evidence

- All 6 Mermaid diagrams in the proposed-system file, and the 2 in the existing-process file, render in a real browser (Chrome, mermaid 10).
- An automatic balance check: every term on the 6 Level 0 flows appears on a matching Level 1 flow in Diagrams 2 to 6 (155 flows checked, 0 uncovered).
- Not checked: each Level 1 flow against the code one by one. The labels follow the system documents and the features built and tested in this project.
