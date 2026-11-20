# Scrollable Activity Timeline & Type Narrowing Fixes

- **Date:** 2026-11-19 10:40 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/ActionsTab.tsx`, `backend/app/services/case_lifecycle.py`, `docs/README.md`
- **Authorization:** User request to make the Activity timeline scrollable and fix Pyrefly diagnostics in `case_lifecycle.py`
- **Type:** Polish

## Intent

Keep the **Activity timeline** panel in the Actions & follow-ups tab compact and easy to browse when many actions accumulate, and resolve Pyrefly type-checker diagnostics in `case_lifecycle.py`.

## Key changes

1. **`frontend/src/admin/pages/case/ActionsTab.tsx`**:
   - Wrapped `<Timeline label="Activity timeline" items={items} />` in a scrollable container (`max-h-96 overflow-y-auto pr-2`) so the timeline scrolls vertically instead of expanding the page indefinitely.

2. **`backend/app/services/case_lifecycle.py`**:
   - Removed redundant `bool(...)` conversions on `report.is_sensitive` in `save_assessment`.
   - Added explicit `scheduled is not None and scheduled.due_at is not None` narrowing before calling `scheduled.due_at.isoformat()` in `close_case`.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`) succeeded with zero errors.
- `.venv\Scripts\python -m py_compile backend/app/services/case_lifecycle.py` and `import app.services.case_lifecycle` succeeded.
