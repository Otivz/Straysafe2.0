"""
"AI Insights (Suggested)" for a case: Phase 1 of the AI-in-report-analysis proposal, plus the advisory Evidence Check (section 2A).

    GET  /cases/{id}/ai-insights    the cached insight for the report's CURRENT content, or not_generated / disabled
    POST /cases/{id}/ai-insights    run it now (the "Generate" / "Refresh" button), cache it, log it
    PUT  /cases/{id}/category       the Leader's own category switch (the card's "Switch category" button)

Rules this file keeps:
  - SUGGEST ONLY. Nothing here changes a report's status, priority, category or evidence sufficiency. The Leader applies a suggestion
    through the ordinary, audited endpoints; record_decision() then notes in the audit log whether they applied or overrode it. The
    evidence check never rejects a photo: it only says what a person should look at.
  - NO PII LEAVES THE SERVER. The payload is built from an allow-list of case fields (never the reporter, the owner, contacts, a
    suspected owner or complaint respondent), and the free text goes through utils/pii_redactor first. At most EVIDENCE_PHOTO_CAP of
    the report's own photos go with it (never a video). A photo cannot be redacted: it can show a face or a house number, which is why
    the resident form warns against it. The cache key is a hash of the redacted payload AND of the photos used, so a changed report or
    a new photo is a new insight, and the stored text holds no personal data either.
  - FAIL CLOSED. Gemini OFF (Admin Settings), no key, a timeout (15 s per call / 35 s in all, utils/ai_suggestions), an empty or
    invalid answer: the endpoint answers 200 with status "disabled" / "unavailable" and the case page carries on. One Gemini call
    answers everything; a photo that cannot be loaded only makes the evidence check "unavailable" while the rest is still made.
"""
import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.case_ai_insight import CaseAiInsight
from app.models.report import Report, ReportCategory, ReportMedia
from app.models.user import User
from app.services import case_lifecycle as L
from app.utils import case_vocab as V
from app.utils.ai_suggestions import call_gemini_with_fallback, gemini_status
from app.utils.pii_redactor import redact_text

# Bump when the prompt or the answer's meaning changes: old cached insights then stop matching and are made again.
PROMPT_VERSION = "2"
PRIORITIES = ("Urgent", "High", "Normal")
CONFIDENCES = ("high", "medium", "low")
EVIDENCE_FLAGS = ("blurry", "no_animal", "contradicts_description")
EVIDENCE_PHOTO_CAP = 2
MAX_DESCRIPTION_CHARS = 1500
MAX_CONDITION_CHARS = 500

ACTION_GENERATED = "CASE_AI_INSIGHT_GENERATED"
ACTION_FAILED = "CASE_AI_INSIGHT_FAILED"
ACTION_APPLIED = "CASE_AI_SUGGESTION_APPLIED"
ACTION_OVERRIDDEN = "CASE_AI_SUGGESTION_OVERRIDDEN"
ACTION_CATEGORY_CHANGED = "CASE_CATEGORY_CHANGED"


# ----------------------------------------------------------------------------------------------------- the input
def known_names(db: Session, report: Report) -> list:
    """Every name tied to this report that the free text must not carry (the redactor masks each, and each of its words)."""
    names = [report.reporter.name if report.reporter is not None else None, report.reported_by_name, report.suspected_owner_name]
    if report.pet_id:
        try:
            from app.models.pet import Pet
            pet = db.get(Pet, report.pet_id)
            owner = db.get(User, pet.owner_id) if pet is not None and getattr(pet, "owner_id", None) else None
            names.append(owner.name if owner is not None else None)
        except Exception:
            pass      # the pet link is optional context; never let it break the redaction of the rest
    return [n for n in names if n]


def build_payload(db: Session, report: Report) -> Dict[str, Any]:
    """
    The only text sent to Gemini. An allow-list: the kind of concern, the animal and the (redacted) words of the report.
    Never the reporter, who it was filed for, contact details, the suspected owner, complaint respondent, location or media links.
    """
    names = known_names(db, report)
    colors = report.animal_colors if isinstance(report.animal_colors, list) else None
    return {
        "category": V.CATEGORY_FAMILIES.get(family_of(report), "Other Animal Concern"),
        "animal_type": report.animal_type or "Unknown",
        "animal_breed": redact_text(report.animal_breed, names) or None,
        "animal_color": redact_text(", ".join(colors) if colors else report.animal_color, names) or None,
        "estimated_size": report.estimated_size,
        "animal_count": report.animal_count or 1,
        "description": redact_text(report.description, names)[:MAX_DESCRIPTION_CHARS],
        "condition": redact_text(report.condition, names)[:MAX_CONDITION_CHARS] or None,
    }


def family_of(report: Report) -> str:
    category = report.category
    return V.category_family(category.category_name if category is not None else None)


# ------------------------------------------------------------------------------------------------ the evidence
def evidence_media(report: Report) -> List[ReportMedia]:
    """
    The photos the evidence check looks at: the report's own photos first (not a timeline attachment, not a Leader's evidence upload),
    then any other photo; images only (a video is never sent); at most EVIDENCE_PHOTO_CAP, oldest first.
    """
    photos = [m for m in (report.media or []) if m.media_type == "Image" and (m.file_url or "").strip()]
    photos.sort(key=lambda m: (bool(m.history_id or m.is_evidence), m.media_id or 0))
    return photos[:EVIDENCE_PHOTO_CAP]


def evidence_signature(media: List[ReportMedia]) -> str:
    """A digest of WHICH photos are in the check (ids and stored addresses), so a new or replaced photo is a new insight. No address is kept."""
    raw = "|".join(f"{m.media_id}:{(m.file_url or '').strip()}" for m in media)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest() if raw else ""


def content_hash(payload: Dict[str, Any], evidence_sig: str = "") -> str:
    raw = json.dumps({"v": PROMPT_VERSION, "p": payload, "e": evidence_sig}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _load_evidence_image(url: str):
    """One stored photo as a small PIL image, or None. Our own uploads folder or a Cloudinary link only (what filing accepts)."""
    import os
    from urllib.parse import urlparse
    value = (url or "").strip()
    if value.startswith(("http://", "https://")):
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.netloc.endswith("cloudinary.com"):
            return None
    elif not (os.path.exists(value) or os.path.exists(os.path.join(os.getcwd(), value.lstrip("/")))):
        return None
    from app.utils.ai_matching import _load_image
    return _load_image(value)


def load_evidence_images(media: List[ReportMedia]) -> list:
    """(media, image) for the photos that could be read, in order. Loading never raises: a photo that cannot be read is left out."""
    out = []
    for m in media:
        try:
            img = _load_evidence_image(m.file_url)
        except Exception:
            img = None
        if img is not None:
            out.append((m, img))
    return out


# --------------------------------------------------------------------------------------------------- the prompt
def build_prompt(payload: Dict[str, Any], photos: int = 0) -> str:
    evidence_part = ""
    evidence_shape = ""
    if photos:
        evidence_part = f"""
EVIDENCE CHECK: {photos} photo(s) of this report are attached after this text. Judge them together against the report:
- "blurry": no attached photo is clear enough to identify the animal or the incident (too blurry, dark or low in detail). Do NOT flag it if at least one photo is clear.
- "no_animal": no dog or cat (or the reported kind of animal) is visible in any attached photo.
- "contradicts_description": the photo clearly conflicts with the report (for example the report says a dog but the photo shows a cat, or a very different coat colour or condition). A small difference or a doubt is not a contradiction.
Flag only what you can actually see. If nothing is wrong, "flags" is an empty list. Never describe or name any person in the photo, and
never read out house numbers, plates or other identifying text.
"""
        evidence_shape = ''',
  "evidence_check": {"flags": ["blurry" | "no_animal" | "contradicts_description"], "summary": "one short sentence on what you see", "confidence": 0.0-1.0}'''
    return f"""You assist the Subdivision Leader of a residential subdivision who triages stray-animal reports (dogs and cats).
You only SUGGEST. A person decides everything. Personal details were removed from the report and appear as [name], [phone],
[email] or [address]: never try to guess or restore them, and never write a name, phone number, email or address.

Report (JSON):
{json.dumps(payload, ensure_ascii=False)}

Kinds of concern (use the id in "suggested_category"):
- found_animal: an animal with no known owner was found or sighted
- nuisance: repeated disturbance, roaming or noise from an animal
- safety: aggressive animal, bite or another risk to residents
- injured: an animal that appears hurt, trapped or in distress
- other: any other animal-related concern
(Lost-pet reports are handled elsewhere: never suggest "lost_pet".)

Priority guide: "Urgent" = possible immediate risk to a person or the animal (active bite or attack, severe injury, cannot move);
"High" = needs attention within the day; "Normal" = routine handling.
{evidence_part}
Answer ONLY with JSON of this exact shape:
{{
  "summary": "2-3 plain sentences describing the situation. No personal details.",
  "suggested_priority": "Urgent" | "High" | "Normal",
  "priority_confidence": "high" | "medium" | "low",
  "priority_reason": "one short sentence",
  "category_check": {{"mismatch": true | false, "suggested_category": "found_animal" | "nuisance" | "safety" | "injured" | "other" | null, "reason": "one short sentence" | null}}{evidence_shape}
}}
Set "mismatch" to true only when the report clearly fits a different kind of concern than "{payload['category']}"."""


def evidence_none(status: str, summary: str) -> Dict[str, Any]:
    """An evidence check with nothing to flag: no_media (nothing to look at) or unavailable (it could not be made). Never a judgement."""
    return {"status": status, "flags": [], "summary": summary, "confidence": 1.0 if status == "no_media" else 0.0}


def parse_evidence(raw: Any, yolo_found: bool) -> Dict[str, Any]:
    """The model's evidence_check, checked. Anything unusable is 'unavailable' (never a guess). yolo_found: the local detector saw a dog or cat."""
    if not isinstance(raw, dict):
        return evidence_none("unavailable", "The AI did not return an evidence check for the photo.")
    given = raw.get("flags") if isinstance(raw.get("flags"), list) else []
    flags = [f for f in dict.fromkeys(str(x).strip().lower() for x in given) if f in EVIDENCE_FLAGS]
    summary = redact_text(" ".join(str(raw.get("summary") or "").split()))[:400]
    try:
        confidence = max(0.0, min(1.0, float(raw.get("confidence") or 0)))
    except (TypeError, ValueError):
        confidence = 0.0
    # The local animal detector saw a dog or cat in this file: do not tell the Leader there is no animal
    if "no_animal" in flags and yolo_found:
        flags.remove("no_animal")
        if not flags:
            summary = "The local animal detector found a dog or cat in the photo."
    return {"status": "flag" if flags else "ok", "flags": flags, "summary": summary, "confidence": round(confidence, 2)}


def parse_answer(text: str, current_family: str, evidence: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Gemini's JSON, checked field by field. Raises ValueError for anything unusable (the caller then fails closed).
    evidence: what was sent for the evidence check: {"sent": bool, "media": bool, "yolo_found": bool}.
    """
    evidence = evidence or {"sent": False, "media": False, "yolo_found": False}
    body = (text or "").strip()
    if body.startswith("```"):
        body = "\n".join(body.split("\n")[1:-1])
    try:
        data = json.loads(body)
    except (ValueError, TypeError) as e:
        raise ValueError("Gemini did not return valid JSON.") from e
    if not isinstance(data, dict):
        raise ValueError("Gemini did not return a JSON object.")
    summary = " ".join(str(data.get("summary") or "").split())
    if len(summary) < 10:
        raise ValueError("Gemini returned no summary.")
    priority = str(data.get("suggested_priority") or "").strip().title()
    if priority not in PRIORITIES:
        raise ValueError("Gemini returned an unknown priority.")
    confidence = str(data.get("priority_confidence") or "").strip().lower()
    check = data.get("category_check") if isinstance(data.get("category_check"), dict) else {}
    suggested = str(check.get("suggested_category") or "").strip().lower() or None
    mismatch = check.get("mismatch") is True and suggested in V.CATEGORY_FAMILIES and suggested not in (V.LOST_PET, current_family)
    if evidence["sent"]:
        evidence_check = parse_evidence(data.get("evidence_check"), evidence["yolo_found"])
    elif evidence["media"]:
        evidence_check = evidence_none("unavailable", "The photo could not be loaded for checking.")
    else:
        evidence_check = evidence_none("no_media", "No photo attached to check.")
    return {
        # the answer is cleaned again: even if the model echoed something, no contact detail or address is kept
        "summary": redact_text(summary)[:900],
        "suggested_priority": priority,
        "priority_confidence": confidence if confidence in CONFIDENCES else None,
        "priority_reason": redact_text(" ".join(str(data.get("priority_reason") or "").split()))[:400] or None,
        "category_mismatch": bool(mismatch),
        "suggested_category": suggested if mismatch else None,
        "category_reason": (redact_text(" ".join(str(check.get("reason") or "").split()))[:400] or None) if mismatch else None,
        "evidence_check": json.dumps(evidence_check),
    }


# ---------------------------------------------------------------------------------------------------- the views
def evidence_view(row: CaseAiInsight) -> Dict[str, Any]:
    """The stored evidence check, or 'unavailable' for a row made before the check existed (it is made again on the next Refresh)."""
    try:
        data = json.loads(row.evidence_check) if row.evidence_check else None
    except (ValueError, TypeError):
        data = None
    if not isinstance(data, dict) or data.get("status") not in ("ok", "flag", "no_media", "unavailable"):
        return evidence_none("unavailable", "No evidence check was made. Refresh to make one.")
    return {"status": data["status"], "flags": [f for f in data.get("flags", []) if f in EVIDENCE_FLAGS],
            "summary": str(data.get("summary") or ""), "confidence": float(data.get("confidence") or 0.0)}


def insight_view(row: CaseAiInsight) -> Dict[str, Any]:
    family = row.suggested_category if row.category_mismatch else None
    return {
        "summary": row.summary,
        "suggested_priority": row.suggested_priority,
        "priority_confidence": row.priority_confidence,
        "priority_reason": row.priority_reason,
        "category_check": {"mismatch": bool(row.category_mismatch), "suggested_category": family,
                           "suggested_category_label": V.CATEGORY_FAMILIES.get(family) if family else None,
                           "reason": row.category_reason if row.category_mismatch else None},
        "evidence_check": evidence_view(row),
        "model": row.model,
        "generated_at": row.generated_at.isoformat() if isinstance(row.generated_at, datetime) else None,
    }


def _answer(status: str, insight: Optional[CaseAiInsight] = None, message: Optional[str] = None) -> Dict[str, Any]:
    """status: ready | not_generated | disabled | unavailable | not_applicable. Always a normal 200: the case page never breaks on it."""
    return {"status": status, "message": message, "insight": insight_view(insight) if insight is not None else None}


def _off_reason(db: Session) -> Optional[str]:
    """Why Gemini cannot be used right now (the Admin switched it OFF, or the server has no key), else None."""
    state = gemini_status(db)
    if state["state"] in ("disabled", "not_configured"):
        return state["reason"]
    return None


def applies_to(report: Report) -> bool:
    """Lost-pet cases are about a registered pet and its owner: no insight is made for them."""
    return not (V.is_lost_pet_report(report) or family_of(report) == V.LOST_PET)


def _key(db: Session, report: Report) -> str:
    return content_hash(build_payload(db, report), evidence_signature(evidence_media(report)))


def current_row(db: Session, report: Report) -> Optional[CaseAiInsight]:
    """The cached insight made from the report's content and photos as they are now, if any."""
    return db.query(CaseAiInsight).filter(CaseAiInsight.report_id == report.report_id, CaseAiInsight.content_hash == _key(db, report)).first()


def read(db: Session, report: Report) -> Dict[str, Any]:
    if not applies_to(report):
        return _answer("not_applicable", message="AI insights are not made for Lost Pet reports.")
    off = _off_reason(db)
    if off:
        return _answer("disabled", message=off)
    row = current_row(db, report)
    return _answer("ready", row) if row is not None else _answer("not_generated")


def generate(db: Session, report: Report, actor: User) -> Dict[str, Any]:
    """Run Gemini on the redacted case (and its photos), cache the answer, log it. Never raises for an AI problem; the caller commits."""
    if not applies_to(report):
        return _answer("not_applicable", message="AI insights are not made for Lost Pet reports.")
    off = _off_reason(db)
    if off:
        return _answer("disabled", message=off)
    payload = build_payload(db, report)
    media = evidence_media(report)
    key = content_hash(payload, evidence_signature(media))
    cached = db.query(CaseAiInsight).filter(CaseAiInsight.report_id == report.report_id, CaseAiInsight.content_hash == key).first()
    loaded = load_evidence_images(media) if media else []
    context = {"sent": bool(loaded), "media": bool(media),
               # the local detector (YOLO) ran on this file when it was filed and found a dog or cat (None = nothing found or not measured)
               "yolo_found": any(m.ai_detection_confidence is not None for m, _ in loaded)}
    try:
        response = call_gemini_with_fallback([build_prompt(payload, photos=len(loaded))] + [img for _, img in loaded],
                                             generation_config={"response_mime_type": "application/json"})
        parsed = parse_answer(getattr(response, "text", ""), family_of(report), context)
    except Exception as e:   # timeout, rate limit, Gemini OFF between the check and the call, empty or invalid JSON
        L.audit(db, actor, ACTION_FAILED, report, f"AI insight for report #{report.report_id} could not be made.",
                new={"reason": type(e).__name__})
        return _answer("unavailable", cached, "AI insights are unavailable right now. You can continue without them.")
    model = getattr(response, "model", None)
    if cached is None:
        cached = CaseAiInsight(report_id=report.report_id, content_hash=key)
        db.add(cached)
    for field, value in parsed.items():
        setattr(cached, field, value)
    cached.model = model
    cached.generated_by = actor.user_id
    cached.generated_at = datetime.now()
    evidence = json.loads(parsed["evidence_check"])
    L.audit(db, actor, ACTION_GENERATED, report, f"{actor.name} generated AI insights (suggestions only) for report #{report.report_id}.",
            new={"model": model, "suggested_priority": parsed["suggested_priority"], "category_mismatch": parsed["category_mismatch"],
                 "evidence_status": evidence["status"], "evidence_flags": evidence["flags"], "photos_checked": len(loaded),
                 "content_hash": key[:12]})
    db.flush()
    return _answer("ready", cached)


# ----------------------------------------------------------------- the Leader decides: applied or overridden
def record_decision(db: Session, report: Report, actor: User, field: str, chosen: str, before: str,
                    insight: Optional[CaseAiInsight]) -> None:
    """
    Note in the audit log that the Leader's priority / category change matched ("applied") or differed from ("overridden") what the
    AI suggested. `insight` was read BEFORE the change (a category switch changes the content hash). No insight, nothing to record.
    """
    if insight is None or chosen == before:
        return
    if field == "priority":
        suggested = (insight.suggested_priority or "").lower()
    else:
        suggested = insight.suggested_category if insight.category_mismatch and insight.suggested_category else before
    action = ACTION_APPLIED if chosen == suggested else ACTION_OVERRIDDEN
    verb = "applied" if chosen == suggested else "overrode"
    L.audit(db, actor, action, report,
            f"{actor.name} {verb} the AI-suggested {field} on report #{report.report_id}: suggested {suggested}, chose {chosen}.",
            old={field: before}, new={field: chosen, "ai_suggested": suggested, "insight_id": insight.insight_id})


# ------------------------------------------------------------------------------------------- switch category
def resolve_category_id(db: Session, family: str) -> Optional[int]:
    """The stored id of a kind of concern: the row named exactly as the kind, else the first older row read as it."""
    found: Dict[str, int] = {}
    for row in db.query(ReportCategory).order_by(ReportCategory.category_id).all():
        fam = V.category_family(row.category_name)
        if fam not in found or row.category_name == V.CATEGORY_FAMILIES[fam]:
            found[fam] = row.category_id
    return found.get(family)


def switch_category(db: Session, report: Report, actor: User, family: str, insight: Optional[CaseAiInsight]) -> None:
    """The Leader moves the case to another kind of concern. Audited; never done by the AI."""
    L.require_open(report, "change its category")
    before = family_of(report)
    if family == before:
        return
    if family not in V.CATEGORY_FAMILIES or family == V.LOST_PET:
        raise HTTPException(status_code=422, detail="Choose another kind of concern.")
    new_id = resolve_category_id(db, family)
    if new_id is None:
        raise HTTPException(status_code=409, detail="This kind of concern is not available in your subdivision.")
    from app.utils import lost_pet_rules
    lost_pet_rules.refuse_category_change(db, report, new_id)
    report.category_id = new_id
    L.audit(db, actor, ACTION_CATEGORY_CHANGED, report,
            f"{actor.name} changed the category of report #{report.report_id} from {V.CATEGORY_FAMILIES[before]} to {V.CATEGORY_FAMILIES[family]}.",
            old={"category": before}, new={"category": family})
    record_decision(db, report, actor, "category", family, before, insight)
