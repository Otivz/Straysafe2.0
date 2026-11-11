"""
Subdivision case settings: enabled categories, policies, follow-up periods and publication policy.

Stored in the existing system_settings table, one row per subdivision (setting_key 'case_settings:<subdivision_id>',
the value is JSON). No new table. The server is the authority: the screens only edit it, and every rule that depends on
a setting (warning policy, follow-up bounds, who may publish a notice) is applied here, not in the browser.

A subdivision with no row gets the defaults below: every category on, NO policies (so no warning can be issued until
a policy is confirmed), follow-ups default to 7 days, and every notice is reviewed before it is published.
"""
import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.system_setting import SystemSetting
from app.schemas.case import CaseSettings, PolicyIn
from app.utils import case_vocab as V

KEY_PREFIX = "case_settings:"


def settings_key(subdivision_id: int) -> str:
    return f"{KEY_PREFIX}{int(subdivision_id)}"


def default_settings() -> CaseSettings:
    return CaseSettings(categories={family: True for family in V.CATEGORY_FAMILIES})


def load_settings(db: Session, subdivision_id: Optional[int]) -> CaseSettings:
    """The stored settings, or the defaults when there are none (or the stored value cannot be read)."""
    if subdivision_id is None:
        return default_settings()
    row = db.query(SystemSetting).filter(SystemSetting.setting_key == settings_key(subdivision_id)).first()
    if row is None or not row.setting_value or not row.is_enabled:
        return default_settings()
    try:
        stored = CaseSettings.model_validate(json.loads(row.setting_value))
    except Exception:  # noqa: BLE001  (a damaged value must never block reports: fall back to the defaults)
        return default_settings()
    for family in V.CATEGORY_FAMILIES:
        stored.categories.setdefault(family, True)
    return stored


def save_settings(db: Session, subdivision_id: int, settings: CaseSettings, user_id: Optional[int]) -> CaseSettings:
    for family in V.CATEGORY_FAMILIES:
        settings.categories.setdefault(family, True)
    value = json.dumps(settings.model_dump(mode="json"))
    row = db.query(SystemSetting).filter(SystemSetting.setting_key == settings_key(subdivision_id)).first()
    if row is None:
        row = SystemSetting(setting_key=settings_key(subdivision_id), setting_value=value, is_enabled=True,
                            description=f"Case workflow settings for subdivision {subdivision_id}", updated_by=user_id)
        db.add(row)
    else:
        row.setting_value, row.is_enabled, row.updated_by = value, True, user_id
    db.flush()
    return settings


# --------------------------------------------------------------------------------------------------- categories
def category_enabled(settings: CaseSettings, family: str) -> bool:
    return bool(settings.categories.get(family, True))


# ------------------------------------------------------------------------------------------------------ policies
def applicable_policies(settings: CaseSettings, family: str) -> List[PolicyIn]:
    """Confirmed policies that cover this kind of concern. A policy still pending confirmation never counts."""
    return [p for p in settings.policies if p.status == "confirmed" and family in p.applies_to]


def resolve_policy(settings: CaseSettings, family: str, policy_id: Optional[str]) -> PolicyIn:
    """
    The policy a warning is issued under. With an id: it must exist, be confirmed and cover the concern. Without one:
    allowed only when exactly one confirmed policy applies. Refuses (409) when none applies.
    """
    candidates = applicable_policies(settings, family)
    if policy_id:
        found = next((p for p in settings.policies if p.id == policy_id), None)
        if found is None:
            raise HTTPException(status_code=404, detail="That policy is not in this subdivision's settings.")
        if found.status != "confirmed":
            raise HTTPException(status_code=409, detail=f"'{found.title}' is not confirmed yet, so it cannot be used for a warning.")
        if family not in found.applies_to:
            raise HTTPException(status_code=409, detail=f"'{found.title}' does not apply to this kind of concern.")
        return found
    if not candidates:
        raise HTTPException(status_code=409, detail="No confirmed policy applies to this concern. Confirm a policy in the subdivision settings first.")
    if len(candidates) > 1:
        raise HTTPException(status_code=422, detail="More than one policy applies. Choose the one the warning is issued under (policy_id).")
    return candidates[0]


# --------------------------------------------------------------------------------------------------- follow-ups
def resolve_followup_due(settings: CaseSettings, due_at: Optional[datetime], now: datetime) -> datetime:
    """The due date of a follow-up: the one asked for if it is within the configured bounds, else the default period."""
    cfg = settings.followups
    if due_at is None:
        return now + timedelta(days=cfg.default_days)
    due = due_at.replace(tzinfo=None) if due_at.tzinfo else due_at
    if due < now - timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="The due date cannot be in the past.")
    if due < now + timedelta(days=cfg.min_days) - timedelta(minutes=5):
        raise HTTPException(status_code=400, detail=f"A follow-up must be at least {cfg.min_days} day(s) ahead in this subdivision.")
    if due > now + timedelta(days=cfg.max_days):
        raise HTTPException(status_code=400, detail=f"A follow-up cannot be more than {cfg.max_days} days ahead in this subdivision.")
    return due


# -------------------------------------------------------------------------------------------------- publication
def publication_mode(settings: CaseSettings, family: str, is_sensitive: bool = False) -> str:
    """
    'immediate' only for a lost-pet or found-animal notice of a case that is not sensitive, and only when the
    subdivision chose it. Everything else, nuisance and safety concerns included, is always reviewed first.
    """
    if is_sensitive or family in V.PRIVATE_BY_DEFAULT_FAMILIES:
        return "review"
    if family == V.LOST_PET:
        return "immediate"          # a missing pet's notice is published by the report itself, at once (2026-11-11): no review
    if family == V.FOUND_ANIMAL:
        return settings.publication.found_animal
    return "review"
