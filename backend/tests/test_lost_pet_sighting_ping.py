"""
Neighbor-to-Neighbor Lost Pet Sighting Ping (docs/01-system/LOST_PET_SIGHTING_PING.md). Since 2026-11-11 a missing pet's notice is
published at once (no review) and recovery is the owner's confirmation (the whole lifecycle is in test_lost_pet_lifecycle.py);
this keeps the notice, sighting, privacy and closure rules: owner requests, the notice is published, residents report sightings (reported time kept apart from submission time, never auto-verified),
owner and leader notified, privacy and scope, duplicates, closure with the report, history kept, no rescue/endorsement.
Run from the backend folder:  python tests/test_lost_pet_sighting_ping.py
"""
import io
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "lost_pet_ping_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-lost-pet-ping-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402
from unittest.mock import patch  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.lost_pet_alert import LostPetAlert, LostPetSighting  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import lost_pet_alerts, reports  # noqa: E402
from app.routes.reports import SELERA_CENTER_LAT as LAT, SELERA_CENTER_LNG as LNG  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (lost_pet_alerts.router, reports.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Elsewhere")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.add_all([ReportCategory(category_id=4, category_name="Roaming"), ReportCategory(category_id=6, category_name="Lost Pet")])


def mk(name, role, subd=1, phone="09170001111"):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subd, barangay_id=1, phone=phone, address="Blk 9 Lot 15")
    db.add(u)
    db.flush()
    return u


owner, neighbor, neighbor2 = mk("Owner Ana", 1), mk("Neighbor Ben", 1), mk("Neighbor Cy", 1)
outsider, leader, leader2, staff = mk("Outsider", 1, subd=2), mk("Leader Lee", 2), mk("LeaderTwo", 2, subd=2), mk("Staff", 3, subd=None)
pet = Pet(owner_id=owner.user_id, pet_name="Bantay", pet_type="Dog", breed="Aspin", color_markings="Brown with white socks",
          distinctive_markings="Red collar", status="Lost", photo_url="https://img.test/bantay.jpg")
db.add(pet)
db.flush()
lost = Report(user_id=owner.user_id, subdivision_id=1, category_id=6, latitude=LAT, longitude=LNG, current_status_id=1,
              pet_id=pet.pet_id, landmark="Main gate", animal_type="Dog", description="[LOST PET REPORT] Missing registered pet: Bantay")
stray = Report(user_id=neighbor.user_id, subdivision_id=1, category_id=4, latitude=LAT, longitude=LNG, current_status_id=1, animal_type="Dog")
db.add_all([lost, stray])
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def notes(uid, ntype=None):
    db.expire_all()
    q = db.query(Notification).filter(Notification.user_id == uid)
    if ntype:
        q = q.filter(Notification.type == ntype)
    return q.count()


def sight(alert_id, user, **kw):
    data = {"latitude": str(kw.pop("lat", LAT + 0.0005)), "longitude": str(kw.pop("lng", LNG)), "accuracy_confirmed": "true",
            "location_label": kw.pop("label", "Near the clubhouse"), **{k: str(v) for k, v in kw.items()}}
    return client.post(f"/lost-pet-alerts/{alert_id}/sightings", headers=H(user), data=data)


# ── 1. Owner requests the alert ──
check("request: neighbors can't request", client.post(f"/lost-pet-alerts/reports/{lost.report_id}/request", headers=H(neighbor), json={}).status_code == 403)
check("request: only lost pet reports",
      client.post(f"/lost-pet-alerts/reports/{stray.report_id}/request", headers=H(neighbor), json={}).status_code == 409)
seen_at = (datetime.now() - timedelta(hours=2)).replace(microsecond=0)
r = client.post(f"/lost-pet-alerts/reports/{lost.report_id}/request", headers=H(owner), json={
    "last_seen_at": seen_at.isoformat(), "last_seen_location": "Subdivision entrance", "contact_preference": "app_message",
    "owner_note": "Shy, answers to Bantay"})
a = r.json()
aid = a.get("alert_id")
check("request: a missing pet's notice is published at once with the last-seen details (no review step)", r.status_code == 200 and a["status"] == "active"
      and a["last_seen"]["location"] == "Subdivision entrance" and a["pet"]["name"] == "Bantay" and a["residents_notified"] == 2, r.text[:300])
check("request: the Leader is not asked to approve anything", notes(leader.user_id, "lost_pet_alert_request") == 0)
check("request: no duplicate open alert", client.post(f"/lost-pet-alerts/reports/{lost.report_id}/request", headers=H(owner), json={}).status_code == 409)
check("a published notice is visible to residents and takes sightings", client.get(f"/lost-pet-alerts/{aid}", headers=H(neighbor)).status_code == 200)

# ── 2. Leader activates (broadcast) ──
check("activate: residents can't", client.post(f"/lost-pet-alerts/{aid}/activate", headers=H(neighbor), json={}).status_code == 403)
check("activate: another subdivision's leader can't", client.post(f"/lost-pet-alerts/{aid}/activate", headers=H(leader2), json={}).status_code == 403)
check("activate: a notice that is already published is not published twice (409)", client.post(f"/lost-pet-alerts/{aid}/activate", headers=H(leader), json={}).status_code == 409)
check("broadcast: subdivision residents get the alert (not the owner as a resident, not other subdivisions)",
      notes(neighbor.user_id, "lost_pet_alert") == 1 and notes(neighbor2.user_id, "lost_pet_alert") == 1
      and notes(outsider.user_id) == 0 and notes(owner.user_id, "lost_pet_alert") == 1)
db.expire_all()
n = db.query(Notification).filter(Notification.user_id == neighbor.user_id, Notification.type == "lost_pet_alert").one()
check("broadcast: photo-card details in the message (name, looks, last seen)", "Bantay" in n.title and "Subdivision entrance" in n.message)
check("scope: the report itself is untouched by the alert", db.get(Report, lost.report_id).current_status_id == 1)
act = client.get("/lost-pet-alerts/active", headers=H(neighbor)).json()["results"]
check("residents: active alerts of their subdivision", [x["alert_id"] for x in act] == [aid])
check("residents of other subdivisions: nothing", client.get("/lost-pet-alerts/active", headers=H(outsider)).json()["results"] == [])
# (A Barangay account is refused for every request since the Barangay accounts were retired: 403, before any notice is looked at.)
check("privacy: other subdivisions and Barangay staff can't open it",
      client.get(f"/lost-pet-alerts/{aid}", headers=H(outsider)).status_code == 404 and client.get(f"/lost-pet-alerts/{aid}", headers=H(staff)).status_code == 403)
d = client.get(f"/lost-pet-alerts/{aid}", headers=H(neighbor)).json()
check("privacy: no owner phone, email or address in the alert", "09170001111" not in str(d) and "Blk 9" not in str(d) and "@test-mail" not in str(d))

# ── 3. Spotted Here ──
check("sighting: accuracy confirmation required", sight(aid, neighbor, accuracy_confirmed="false").status_code == 400)
check("sighting: outside the coverage area refused", sight(aid, neighbor, lat=LAT + 1).status_code == 400)
check("sighting: future time refused", sight(aid, neighbor, seen_at=(datetime.now() + timedelta(hours=2)).isoformat()).status_code == 400)
check("sighting: other subdivisions can't submit", sight(aid, outsider).status_code == 404)
earlier = (datetime.now() - timedelta(minutes=45)).replace(microsecond=0)
r = sight(aid, neighbor, seen_at=earlier.isoformat(), description="Drinking at the clubhouse fountain", client_request_id="req-1")
s1 = r.json().get("sighting", {})
check("sighting: saved unverified with the reported time apart from the submission time", r.status_code == 200
      and s1["status"] == "unverified" and s1["seen_at"].startswith(earlier.isoformat()[:16]) and s1["submitted_at"] != s1["seen_at"], r.text[:300])
from app.utils.db_clock import db_now  # noqa: E402
check("sighting: the server records the submission time (database clock)",
      abs(datetime.fromisoformat(s1["submitted_at"]) - db_now(db)) < timedelta(minutes=5), s1["submitted_at"])
r2 = sight(aid, neighbor, seen_at=earlier.isoformat(), description="Drinking at the clubhouse fountain", client_request_id="req-1")
check("duplicate: same submission id returns the first record", r2.json().get("duplicate") is True
      and r2.json()["sighting"]["sighting_id"] == s1["sighting_id"])
r3 = sight(aid, neighbor, seen_at=earlier.isoformat())
check("duplicate: an immediate double tap at the same pin isn't a second record", r3.json().get("duplicate") is True)
db.expire_all()
check("duplicate: one record stored", db.query(LostPetSighting).filter(LostPetSighting.alert_id == aid).count() == 1)
check("notify: the owner is told someone saw the pet (an ordinary sighting is not a Leader task)", notes(owner.user_id, "lost_pet_sighting") == 1
      and notes(leader.user_id, "lost_pet_sighting") == 0 and notes(neighbor.user_id, "lost_pet_sighting") == 0)
n = db.query(Notification).filter(Notification.user_id == owner.user_id, Notification.type == "lost_pet_sighting").one()
check("notify: in plain words, with the place (never \"near Near ...\") and the time it was seen", n.title.startswith("Someone saw ")
      and "near the clubhouse" in n.message and "near Near" not in n.message and " at " in n.message and "tracking map" not in n.message, f"{n.title} | {n.message}")
with patch("app.utils.cloudinary_config.upload_to_cloudinary", return_value="https://img.test/sighting.jpg"):
    r = client.post(f"/lost-pet-alerts/{aid}/sightings", headers=H(neighbor2), data={
        "latitude": str(LAT - 0.0004), "longitude": str(LNG + 0.0003), "accuracy_confirmed": "true", "location_source": "device"},
        files={"photo": ("dog.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "image/png")})
check("sighting: optional photo and device location", r.status_code == 200 and r.json()["sighting"]["photo_url"] == "https://img.test/sighting.jpg"
      and r.json()["sighting"]["location_source"] == "device", r.text[:300])

# Map / timeline data
d = client.get(f"/lost-pet-alerts/{aid}", headers=H(owner)).json()
check("map: last known location plus every sighting, ordered by reported time",
      d["last_seen"]["location"] == "Subdivision entrance" and len(d["sightings"]) == 2
      and d["sightings"][0]["seen_at"] <= d["sightings"][1]["seen_at"])
check("latest sighting = the latest submitted", d["latest_sighting"]["sighting_id"] == d["sightings"][-1]["sighting_id"] or
      d["latest_sighting"]["submitted_at"] >= max(x["submitted_at"] for x in d["sightings"]))
check("the owner is never given a reporter's name or phone (the app promises it)", d["sightings"][0]["reported_by"] == "A neighbor" and "Neighbor Ben" not in str(d) and "09170001111" not in str(d))
d2 = client.get(f"/lost-pet-alerts/{aid}", headers=H(neighbor2)).json()
check("neighbors see 'A neighbor' / 'You', not names", {x["reported_by"] for x in d2["sightings"]} == {"A neighbor", "You"})
check("report page: the alert with its latest sighting",
      client.get(f"/lost-pet-alerts/reports/{lost.report_id}", headers=H(owner)).json()["alert"]["sighting_count"] == 2)

# Leader review: never automatic
sid = d["sightings"][0]["sighting_id"]
check("review: residents can't verify", client.post(f"/lost-pet-alerts/sightings/{sid}/review", headers=H(neighbor), json={"status": "verified"}).status_code == 403)
r = client.post(f"/lost-pet-alerts/sightings/{sid}/review", headers=H(leader), json={"status": "verified", "note": "Matches the CCTV"})
check("review: the leader verifies", r.status_code == 200 and r.json()["status"] == "verified")

# Dashboard
dash = client.get("/lost-pet-alerts/dashboard", headers=H(leader)).json()
check("dashboard: stats from the records", dash["stats"]["active_alerts"] == 1 and dash["stats"]["total_sightings"] == 2
      and dash["stats"]["pets_reunited"] == 0 and len(dash["recent_sightings"]) == 2, dash["stats"])
check("dashboard: residents can't open it", client.get("/lost-pet-alerts/dashboard", headers=H(neighbor)).status_code == 403)

# ── 4. Reunited: report resolved, alert closed, history kept ──
check("recovered: residents can't record it", client.post(f"/lost-pet-alerts/{aid}/record-recovery", headers=H(neighbor), json={"source": "phone"}).status_code == 403)
r = client.post(f"/lost-pet-alerts/{aid}/record-recovery", headers=H(leader), json={"source": "phone", "confirmed_at": (datetime.now() - timedelta(minutes=10)).isoformat(), "note": "Owner confirmed Bantay is home"})
db.expire_all()
rep = db.get(Report, lost.report_id)
check("recovered: the Leader records the owner's confirmation: the report is Claimed by Owner and the alert is closed as recovered", r.status_code == 200
      and rep.current_status_id == 9 and rep.custody_status == "Reunited with Owner" and r.json()["alert"]["status"] == "closed"
      and r.json()["alert"]["close_outcome"] == "recovered", r.text[:300])
check("reunited: no new sightings accepted", sight(aid, neighbor2, lat=LAT + 0.0002).status_code == 409)
check("reunited: sightings kept", db.query(LostPetSighting).filter(LostPetSighting.alert_id == aid).count() == 2)
check("reunited: helpers thanked", notes(neighbor.user_id) >= 2 and notes(neighbor2.user_id) >= 2)
check("closed: a neighbor who reported can still see it; others can't",
      client.get(f"/lost-pet-alerts/{aid}", headers=H(neighbor)).status_code == 200 and client.get(f"/lost-pet-alerts/active", headers=H(neighbor)).json()["results"] == [])
dash = client.get("/lost-pet-alerts/dashboard", headers=H(leader)).json()
check("dashboard: reunited counted, resolved list", dash["stats"]["pets_reunited"] == 1 and dash["stats"]["active_alerts"] == 0 and len(dash["resolved"]) == 1)

# ── 5. Closing the report any other way closes the alert too (Pet Recovered by the owner) ──
pet2 = Pet(owner_id=owner.user_id, pet_name="Muning", pet_type="Cat", status="Lost")
db.add(pet2)
db.flush()
lost2 = Report(user_id=owner.user_id, subdivision_id=1, category_id=6, latitude=LAT, longitude=LNG, current_status_id=1, pet_id=pet2.pet_id,
               description="[LOST PET REPORT] Missing registered pet: Muning")
db.add(lost2)
db.commit()
a2 = client.post(f"/lost-pet-alerts/reports/{lost2.report_id}/request", headers=H(owner), json={}).json()["alert_id"]
r = client.post(f"/reports/{lost2.report_id}/confirm-reunited", headers=H(owner), json={"notes": "She came home"})
db.expire_all()
al2 = db.get(LostPetAlert, a2)
check("owner's Pet Recovered closes the alert (recovered)", al2.status == "closed" and al2.close_outcome == "recovered", (r.status_code, r.text[:200], al2.status))

# Leader closes without resolving: report stays open
pet3 = Pet(owner_id=owner.user_id, pet_name="Tagpi", pet_type="Dog", status="Lost")
db.add(pet3)
db.flush()
lost3 = Report(user_id=owner.user_id, subdivision_id=1, category_id=6, latitude=LAT, longitude=LNG, current_status_id=1, pet_id=pet3.pet_id,
               description="[LOST PET REPORT] Missing registered pet: Tagpi")
db.add(lost3)
db.commit()
a3 = client.post(f"/lost-pet-alerts/reports/{lost3.report_id}/request", headers=H(owner), json={}).json()["alert_id"]
check("close: a reason is required", client.post(f"/lost-pet-alerts/{a3}/close", headers=H(leader), json={"outcome": "not_found", "reason": "x"}).status_code == 422)
r = client.post(f"/lost-pet-alerts/{a3}/close", headers=H(leader), json={"outcome": "not_found", "reason": "No sightings for two weeks"})
db.expire_all()
check("close: alert closed, report left open (endorsement still possible)", r.status_code == 200 and r.json()["status"] == "closed"
      and db.get(Report, lost3.report_id).current_status_id == 1)
pet4 = Pet(owner_id=owner.user_id, pet_name="Puti", pet_type="Cat", status="Lost")
db.add(pet4)
db.flush()
lost4 = Report(user_id=owner.user_id, subdivision_id=1, category_id=6, latitude=LAT, longitude=LNG, current_status_id=1, pet_id=pet4.pet_id,
               description="[LOST PET REPORT] Missing registered pet: Puti")
db.add(lost4)
db.commit()
r = client.post(f"/lost-pet-alerts/reports/{lost4.report_id}/request", headers=H(leader), json={})
check("leader can prepare an alert from the report; it belongs to the pet's owner", r.status_code == 200
      and db.get(LostPetAlert, r.json()["alert_id"]).owner_id == owner.user_id, r.text[:200])
check("another subdivision's leader can't", client.post(f"/lost-pet-alerts/reports/{lost3.report_id}/request", headers=H(leader2), json={}).status_code == 403)
check("close: the owner can publish it again", client.post(f"/lost-pet-alerts/reports/{lost3.report_id}/request", headers=H(owner), json={}).json()["status"] == "active")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
