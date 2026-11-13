"""
A throwaway API for the browser tests of the connected interfaces (frontend/tests/liveInterfaces.browser.mjs).

It is the real backend code (the same routers app.main wires) on a brand-new SQLite file made by tests/_isolated_db.py, seeded with
a small, fake subdivision. It never reads .env, never opens the configured database and never sends anything: every credential
that could reach an outside service is blanked and the MySQL driver is disabled. app.main itself cannot run here (its start-up is
MySQL only), which is why the routers are assembled the way the other tests assemble them.

    python tests/e2e_server.py            # listens on 127.0.0.1:8765 (E2E_API_PORT), prints READY when it is up

One extra route exists ONLY in this script: GET /__e2e/otp?email=... returns the sign-up code that would have been emailed, so the
test can finish a registration without a mailbox. The application has no such route.
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

import os
from datetime import datetime, timedelta
from decimal import Decimal

from app.limiter import limiter
from app.routes import (announcements, auth, case_alerts, case_messages, cases, chat, landmarks, lost_found, lost_pet_alerts, notifications, ownership_claims, pet_ownership,
                        pets, reports, users, warnings, analytics, owner_followups)

PASSWORD = "Test#Pass2026xx"

api = _isolated_db.build_app(auth.router, users.router, reports.router, pets.router, notifications.router, announcements.router, chat.router,
                             warnings.router, owner_followups.router, lost_pet_alerts.router, cases.router, ownership_claims.router,
                             landmarks.router, analytics.router, pet_ownership.router, lost_found.router, case_messages.router, case_alerts.router)
limiter.enabled = False                      # the test signs in many times a minute
api.state.limiter = limiter

from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.sql.functions import now as sql_now  # noqa: E402


@compiles(sql_now, "sqlite")
def _sqlite_local_now(element, compiler, **kw):
    """
    SQLite's CURRENT_TIMESTAMP is UTC; MySQL's NOW() is the server's local time, and the application and every screen read the naive
    times it stores as local wall-clock time. Without this, rows the database stamps by itself (status history, notifications)
    would look eight hours old next to rows the application stamps, on a machine in Manila. Registered before the tables are made.
    """
    return "datetime('now', 'localtime')"


ids = _isolated_db.create_schema_and_seed()


def use_production_category_ids() -> None:
    """
    Number the report categories the way the real schema script (Database3.4_subdivision.sql) does.

    Older backend code recognises a Lost Pet report by its category id, 6 (claim_custody.LOST_PET_CATEGORY_ID, also used by
    matching and the legacy screens). The real database has five older categories first, so "Lost Pet" is 6 there; the
    throwaway database numbers the six case categories from 1 and "Lost Pet" would be 1. The connected app picks a category by
    NAME, so against that numbering a lost-pet report it files would not be recognised as one and its notice would be refused.
    The renumbering makes this fixture match what the app meets in production. It runs before any report is added, so only the
    one report the shared seed made needs to follow its category.
    """
    from sqlalchemy import text
    from app.database import engine
    older = ["Injured", "Aggressive", "Rabies Risk", "Roaming Animal", "Rescue Needed"]
    final = {"Lost Pet": 6, "Found / Unidentified Animal": 7, "Animal Nuisance": 8, "Animal Safety Concern": 9,
             "Injured / Distressed Animal": 10, "Other Animal Concern": 11}
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT category_id, category_name FROM report_categories")).fetchall()
        assert {name for _, name in rows} == set(final), rows
        for old, _ in rows:                                    # out of the way first, so no two rows ever share an id
            conn.execute(text("UPDATE report_categories SET category_id = :new WHERE category_id = :old"), {"new": old + 100, "old": old})
            conn.execute(text("UPDATE reports SET category_id = :new WHERE category_id = :old"), {"new": old + 100, "old": old})
        for old, name in rows:
            conn.execute(text("UPDATE report_categories SET category_id = :new WHERE category_id = :old"), {"new": final[name], "old": old + 100})
            conn.execute(text("UPDATE reports SET category_id = :new WHERE category_id = :old"), {"new": final[name], "old": old + 100})
        for number, name in enumerate(older, start=1):
            conn.execute(text("INSERT INTO report_categories (category_id, category_name) VALUES (:i, :n)"), {"i": number, "n": name})


use_production_category_ids()

from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from app.database import SessionLocal  # noqa: E402
from app.models.announcement import Announcement, AnnouncementCategory  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.lost_pet_alert import LostPetAlert  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.otp import OtpVerification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportCategory, ReportMedia, StatusHistory  # noqa: E402
from app.models.user import Subdivision, User  # noqa: E402
from app.schemas.case import CaseSettings, OfficeProfile, PolicyIn  # noqa: E402
from app.utils import case_policy  # noqa: E402
from app.utils.auth import get_password_hash  # noqa: E402


def seed() -> None:
    db = SessionLocal()
    try:
        hashed = get_password_hash(PASSWORD)
        who = {"resident": ("Rita Reporter", "rita@e2e-straysafe.com"), "leader": ("Lena Leader", "leader@e2e-straysafe.com"),
               "staff": ("Barry Brgy", "staff@e2e-straysafe.com"), "admin": ("Ada Admin", "admin@e2e-straysafe.com")}
        for label, (name, email) in who.items():
            u = db.get(User, ids[label])
            u.name, u.email, u.password, u.phone = name, email, hashed, "09171234567"
            u.address = "Blk 4 Lot 12, Molave St." if label == "resident" else None
        owen = User(name="Owen Owner", email="owen@e2e-straysafe.com", password=hashed, role_id=1, is_verified=True, status="Active", subdivision_id=1,
                    barangay_id=1, phone="09179998888", address="Blk 7 Lot 3, Acacia St.")
        db.add(owen)
        db.add(AnnouncementCategory(category_name="Animal Advisory"))
        db.add(AnnouncementCategory(category_name="General Advisory"))
        db.commit()
        db.refresh(owen)

        sub = db.get(Subdivision, 1)
        sub.subdivision_name = "Selera Homes"
        settings = CaseSettings(categories={k: True for k in ("lost_pet", "found_animal", "nuisance", "safety", "injured", "other")},
                                policies=[PolicyIn(id="pol-1", title="Animals outside the owner's lot", reference="House Rules §6.3", summary="Keep pets in the lot or on a leash.",
                                                   applies_to=["nuisance", "safety"], observation_days=3, status="confirmed")],
                                office=OfficeProfile(address="HOA Office, Clubhouse", phone="02 8123 4567", email="office@selera.example", hours="Mon-Sat 8-5"))
        case_policy.save_settings(db, 1, settings, ids["leader"])

        cat = {c.category_name: c.category_id for c in db.query(ReportCategory).all()}
        now = datetime.now()

        def report(owner_id, category, status=1, ago_days=1, landmark="Gate 2", lat="14.80120000", lng="121.00400000", description="A dog.", **extra):
            r = Report(user_id=owner_id, subdivision_id=1, category_id=cat[category], current_status_id=status, animal_type="Dog", landmark=landmark,
                       latitude=Decimal(lat), longitude=Decimal(lng), description=description, created_at=now - timedelta(days=ago_days), **extra)
            db.add(r)
            db.flush()
            db.add(StatusHistory(report_id=r.report_id, report_status_id=status, updated_by=owner_id, remarks="Initial report submitted by resident.",
                                 created_at=now - timedelta(days=ago_days)))
            return r

        # the report the isolated seed made (Rita's) becomes a nuisance complaint the Leader can assess
        first = db.get(Report, ids["report"])
        first.category_id, first.description, first.is_sensitive = cat["Animal Nuisance"], "A brown dog barks all night near Gate 2.", True
        first.created_at = now - timedelta(days=2)
        nuisance = first
        # the shared seed makes this report directly; the real create route always writes this first line of the timeline
        db.add(StatusHistory(report_id=nuisance.report_id, report_status_id=1, updated_by=ids["resident"], remarks="Initial report submitted by resident.",
                             created_at=now - timedelta(days=2)))
        safety = report(owen.user_id, "Animal Safety Concern", description="A big dog lunged at joggers by the clubhouse.", landmark="Clubhouse", ago_days=1)
        injured = report(ids["resident"], "Injured / Distressed Animal", status=2, description="A cat with a hurt leg under a car.", ago_days=4)
        lost = report(ids["resident"], "Lost Pet", description="Mochi, a white shih tzu, slipped out of the gate.", ago_days=1, landmark="Near the clubhouse")
        found = report(owen.user_id, "Found / Unidentified Animal", status=2, description="A friendly brown dog with a red collar.", ago_days=3, landmark="Clubhouse")
        # a report filed before the case workflow keeps the category it was filed under ("Aggressive" is read as a safety concern) and a legacy
        # closed status (3): real data looks like this, and the screens must name it correctly
        report(ids["resident"], "Aggressive", status=3, description="A large dog snapped at me near the park path last month.", ago_days=20, landmark="Park path")
        db.add(ReportMedia(report_id=nuisance.report_id, file_url="https://res.cloudinary.test/e2e/dog.jpg", media_type="Image", is_evidence=False))

        db.add(Pet(pet_name="Mochi", pet_type="Dog", breed="Shih Tzu", color_markings="White and gold", owner_id=ids["resident"], status="Active",
                   registered_by_user_id=ids["resident"], registered_by_name="Rita Reporter"))
        db.add(LostPetAlert(report_id=lost.report_id, subdivision_id=1, status="active", alert_type="lost_pet", owner_id=ids["resident"], requested_by=ids["resident"],
                            last_seen_location="Near the clubhouse", last_seen_lat=Decimal("14.80063400"), last_seen_lng=Decimal("121.00222800"),
                            last_seen_at=now - timedelta(hours=5), activated_by=ids["leader"], activated_at=now - timedelta(hours=4), requested_at=now - timedelta(hours=6),
                            leader_message="Please keep an eye out for Mochi.", contact_preference="app_message"))
        db.add(LostPetAlert(report_id=found.report_id, subdivision_id=1, status="active", alert_type="found_animal", owner_id=None, requested_by=ids["leader"],
                            last_seen_location="Clubhouse", last_seen_lat=Decimal("14.80063400"), last_seen_lng=Decimal("121.00222800"), last_seen_at=now - timedelta(days=3),
                            activated_by=ids["leader"], activated_at=now - timedelta(days=2), requested_at=now - timedelta(days=2), contact_preference="app_message"))
        found.visibility, found.verification_status = "Public", "verified_true"
        animal_advisory_cat = db.query(AnnouncementCategory).filter(AnnouncementCategory.category_name == "Animal Advisory").first()
        db.add(Announcement(barangay_id=1, subdivision_id=1, created_by=ids["leader"], category_id=animal_advisory_cat.category_id,
                            title="Rabies vaccination reminder", content="Please keep your pets' vaccinations up to date.", visibility="Subdivision Only", priority_level="Normal",
                            status="Published", published_at=now - timedelta(days=5)))
        db.add(Landmark(name="Selera Homes Main Entrance Gate", category="general", subdivision_id=1, barangay_id=1, latitude=Decimal("14.80149600"),
                        longitude=Decimal("121.00517400"), status="Active"))
        db.add(Notification(user_id=ids["leader"], title="New report", message="A new report needs review.", type="new_report", related_id=safety.report_id))
        db.add(Notification(user_id=ids["resident"], title="Your report was updated", message="An officer is looking at it.", type="status_update", related_id=nuisance.report_id))
        db.commit()
    finally:
        db.close()


seed()


@api.get("/__e2e/otp")
def latest_otp(email: str):
    """TEST ONLY: the newest unused sign-up code for this email."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        row = (db.query(OtpVerification).filter(OtpVerification.user_id == user.user_id, OtpVerification.is_used == False)  # noqa: E712
               .order_by(OtpVerification.otp_id.desc()).first()) if user else None
        return {"otp": row.otp_code if row else None}
    finally:
        db.close()


@api.get("/__e2e/ids")
def ids_route():
    return ids


if __name__ == "__main__":
    import uvicorn
    print(f"E2E API on 127.0.0.1:{os.environ.get('E2E_API_PORT', '8765')}", flush=True)
    uvicorn.run(api, host="127.0.0.1", port=int(os.environ.get("E2E_API_PORT", "8765")), log_level="warning")
