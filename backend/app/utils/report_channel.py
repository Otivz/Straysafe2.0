"""
Who reported a case and how (backend/migrations/2026-11-23_report_channel.sql).

A resident files in the app (channel NULL). A Subdivision Leader / Admin can file too: 'self' when they saw it themselves, or 'call',
'walk_in', 'message', 'other' for a person who told them. The staff "reporter" block of a case then names that person, not the
staff member's account (which stays in reports.user_id as the one who filed it).
"""
from typing import Dict, Optional

CHANNELS = ("self", "call", "walk_in", "message", "other")
CHANNEL_LABELS = {None: "via app", "self": "filed by the Subdivision Leader", "call": "via call", "walk_in": "walk-in",
                  "message": "via message", "other": "reported in person"}


def reporter_block(report, names: Dict[int, str]) -> dict:
    """The staff view of who reported it: the person (with their account id when they have one), how, and who filed it."""
    channel: Optional[str] = getattr(report, "report_channel", None)
    filed_by = names.get(report.user_id) if report.user_id is not None else None
    if channel and channel != "self":
        return {"user_id": getattr(report, "reported_on_behalf_of", None), "name": report.reported_by_name, "channel": channel,
                "channel_label": CHANNEL_LABELS.get(channel, "reported in person"), "contact": report.reported_by_contact,
                "filed_by_user_id": report.user_id, "filed_by_name": filed_by}
    return {"user_id": report.user_id, "name": filed_by, "channel": channel, "channel_label": CHANNEL_LABELS.get(channel, "via app"),
            "contact": None, "filed_by_user_id": report.user_id if channel else None, "filed_by_name": filed_by if channel else None}
