# Display Animal Type Chips in Same Occurrence Comparison Dialog

- **Date:** 2026-11-17 07:48 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`
- **Authorization:** User screenshot inspection showing why SS-2026-0023 and SS-2026-0025 were compared
- **Type:** Polish

## Intent

Display the database-recorded animal type (`Cat`, `Dog`, etc.) as a clear chip badge beside the report reference in both complaint comparison cards within the `SameOccurrenceDialog`. This clarifies to the Leader why two reports were identified as candidates when an attached photo depicts a different animal species than what was recorded.

## Key changes

1. **`frontend/src/admin/pages/complaints/ComplaintDialogs.tsx`**:
   - In `SameOccurrenceDialog`: added `{o.animal_type ? <span className="sa-mc__chip text-xs">{o.animal_type}</span> : null}` to the Earlier complaint header and `{p.c.animal?.type ? <span className="sa-mc__chip text-xs">{p.c.animal.type}</span> : null}` to This complaint header.

## Validation evidence

- Ran `npm --prefix frontend run build`: TypeScript compile and Vite production build passed cleanly in 2.45s.
