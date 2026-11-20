# Migrate Notification Model to SQLAlchemy 2.0 Mapped Typing

- **Date:** 2026-11-20 20:15 (UTC)
- **AI tool:** Antigravity (Gemini 4 Argon)
- **Files changed:** `backend/app/models/notification.py`, `docs/05-operations/agents/feature-updates/2026-11-20_2015_notification-model-sqlalchemy2-typing.md`
- **Authorization:** User request to explain and fix `datetime is not assignable to attribute created_at with type Column[datetime]` at `backend/app/services/case_messaging.py:L508`
- **Type:** Fix

## Intent

Resolve static type checker errors when assigning `str` and `datetime` values to `Notification` instance attributes (`pending.title, pending.message, pending.created_at = ...`) in `case_messaging.py`.

## Key changes

- **`backend/app/models/notification.py`**: Migrated `Notification` columns (`notification_id`, `user_id`, `title`, `message`, `type`, `is_read`, `is_archived`, `created_at`, `related_id`) and the `user` relationship from legacy SQLAlchemy 1.x `Column(...)` declarations to SQLAlchemy 2.0 `Mapped[...] = mapped_column(...)` annotations.

## Validation evidence

- `python -m py_compile app/models/notification.py app/services/case_messaging.py` (exit code 0)
- `python tests/test_merged_concerns_case_management.py` (`[PASS] test_merged_concerns_case_management`, exit code 0)
