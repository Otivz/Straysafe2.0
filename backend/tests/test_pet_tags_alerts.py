"""
Pet QR tags, Phase 3 (scans and lost-pet alerts, the Leader's view): docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md.

The scan card gives the alert id only to a signed-in resident of the alert's subdivision while the alert is active; a
"tell the owner" message is filed under the pet's open alert (requested or active) and never becomes a sighting; the
Leader sees which pets have a tag and the messages of an alert in their own subdivision only, without phone numbers.
Run from the backend folder:  python tests/test_pet_tags_alerts.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401  (throwaway SQLite, before any app import)

from fastapi.testclient import TestClient  # noqa: E402

from _isolated_db import build_app, create_schema_and_seed  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.lost_pet_alert import LostPetAlert, LostPetSighting  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_tag import PetTagScan  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import pet_tags  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

os.environ.pop("ENABLE_PET_TAGS", None)
api = build_app(pet_tags.router, pet_tags.public_router, pet_tags.leader_router)
api.state.limiter = limiter
limiter.enabled = False
client = TestClient(api, raise_server_exceptions=False)
ids = create_schema_and_seed()
db = SessionLocal()


def mk_user(name, role, subdivision_id=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@isolated.test", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subdivision_id, barangay_id=1)
    db.add(u)
    db.flush()
    return u


owner = db.get(User, ids["resident"])
leader = db.get(User, ids["leader"])
admin = db.get(User, ids["admin"])
neighbour = mk_user("Nina Neighbour", 1)
far_resident = mk_user("Fred Far", 1, subdivision_id=2)
other_leader = mk_user("Olga Other", 2, subdivision_id=2)
far_owner = mk_user("Fiona Far Owner", 1, subdivision_id=2)
pet = Pet(pet_name="Bantay", pet_type="Dog", owner_id=owner.user_id, status="Lost")
untagged = Pet(pet_name="Mingming", pet_type="Cat", owner_id=owner.user_id, status="Active")
far_pet = Pet(pet_name="Far", pet_type="Dog", owner_id=far_owner.user_id, status="Active")
db.add_all([pet, untagged, far_pet])
db.flush()
alert = LostPetAlert(report_id=ids["report"], subdivision_id=1, pet_id=pet.pet_id, owner_id=owner.user_id, status="active", alert_type="lost_pet")
db.add(alert)
db.commit()
PET, ALERT = pet.pet_id, alert.alert_id


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}


results = []


def check(name, cond, extra=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))


def set_alert(status):
    db.get(LostPetAlert, ALERT).status = status
    db.commit()


token = client.post(f"/pets/{PET}/tag", headers=H(owner)).json()["token"]
far_token = client.post(f"/pets/{far_pet.pet_id}/tag", headers=H(far_owner)).json()["token"]


def card(user=None):
    return client.get(f"/t/{token}", headers=H(user) if user else {}).json()


# --- 3.1 the alert id on the card
check("a neighbour in the alert's subdivision gets the alert id", card(neighbour)["alert_id"] == ALERT)
check("a guest does not", card()["alert_id"] is None)
check("a resident of another subdivision does not", card(far_resident)["alert_id"] is None)
check("the owner does not", card(owner)["alert_id"] is None)
check("the Leader (not a finder) does not", card(leader)["alert_id"] is None)
set_alert("requested")
check("a requested (not yet public) alert is not given", card(neighbour)["alert_id"] is None)
set_alert("closed")
check("a closed alert is not given", card(neighbour)["alert_id"] is None)
set_alert("active")


# --- 3.3 messages are filed under the open alert
def send(user=None, **body):
    r = client.post(f"/t/{token}/found", json={"location_label": "Near the gate", **body}, headers=H(user) if user else {})
    db.expire_all()
    return r, db.query(PetTagScan).filter(PetTagScan.kind == "found_report").order_by(PetTagScan.scan_id.desc()).first()


r, s = send(finder_phone="09175556666", share_contact=True)
check("a guest's message during an active alert is filed under it", r.status_code == 200 and s.alert_id == ALERT, r.text)
set_alert("requested")
r, s = send(neighbour)
check("... and during a requested alert too", s.alert_id == ALERT)
set_alert("closed")
r, s = send()
check("a closed alert is not used", s.alert_id is None)
set_alert("active")
check("no message ever becomes a neighbour-visible sighting", db.query(LostPetSighting).count() == 0)
r = client.get(f"/pets/{PET}/tag/scans", headers=H(owner))
check("the owner's history carries the alert id", [c["alert_id"] for c in r.json()["found_reports"]] == [None, ALERT, ALERT])

# --- 3.4 the Leader's view
r = client.get("/pet-tags/active", headers=H(leader))
check("the Leader sees which of their pets have a tag", r.status_code == 200 and r.json()["pet_ids"] == [PET], r.text)
check("another subdivision's Leader sees only their own", client.get("/pet-tags/active", headers=H(other_leader)).json()["pet_ids"] == [far_pet.pet_id])
check("the system admin sees all", client.get("/pet-tags/active", headers=H(admin)).json()["pet_ids"] == sorted([PET, far_pet.pet_id]))
check("a resident cannot list tagged pets", client.get("/pet-tags/active", headers=H(neighbour)).status_code == 403)
client.post(f"/pets/{PET}/tag/disable", headers=H(leader))
check("a turned-off tag drops out of the list", client.get("/pet-tags/active", headers=H(leader)).json()["pet_ids"] == [])
token = client.post(f"/pets/{PET}/tag", headers=H(owner)).json()["token"]

r = client.get(f"/pet-tags/alerts/{ALERT}/scans", headers=H(leader))
msgs = r.json().get("found_reports", [])
check("the Leader sees the messages filed under the alert", r.status_code == 200 and len(msgs) == 2, r.text)
check("... without any phone number", all(m["finder_phone"] is None for m in msgs) and "09175556666" not in r.text)
check("... and says a number was shared", any(m["phone_shared"] for m in msgs))
check("another subdivision's Leader gets 404", client.get(f"/pet-tags/alerts/{ALERT}/scans", headers=H(other_leader)).status_code == 404)
check("a resident (even the owner) gets 403", client.get(f"/pet-tags/alerts/{ALERT}/scans", headers=H(owner)).status_code == 403)
check("an unknown alert is 404", client.get("/pet-tags/alerts/99999/scans", headers=H(leader)).status_code == 404)
check("signed out is 401", client.get(f"/pet-tags/alerts/{ALERT}/scans").status_code == 401)
check("/pets/{id} routes are not shadowed", client.get(f"/pets/{PET}/tag", headers=H(leader)).status_code == 200)

# --- QR_TAG_SCAN_TO_CASE_PLAN phase 1: the missing-pet case reacts to a message
from app.models.report import Report, StatusHistory  # noqa: E402
from app.utils import case_state  # noqa: E402


def case_lines():
    db.expire_all()
    return [h.remarks or "" for h in db.query(StatusHistory).filter(StatusHistory.report_id == ids["report"]).order_by(StatusHistory.history_id).all()]


def set_case(status):
    rep = db.get(Report, ids["report"])
    rep.case_status = status
    rep.current_status_id = {"reported": 1, "under_review": 2, "closed": 14}[status]
    if status == "closed":
        rep.closure_disposition = "invalid_report"
    db.commit()


set_alert("active")
set_case("reported")
before = len(case_lines())
r, s = send()
lines = case_lines()
check("a guest's message writes one history line, labelled as a guest", r.status_code == 200 and len(lines) == before + 1
      and "guest (not signed in)" in lines[-1], lines[-3:])
check("... and does not change the case status", case_state.case_status_of(db.get(Report, ids["report"])) == "reported")
check("... and the line names nobody and has no phone or note", all(x not in lines[-1] for x in ("Nina", "0917", "Near the gate")))
r, s = send(neighbour)
lines = case_lines()
check("a signed-in neighbour's message writes its line", r.status_code == 200 and any("A neighbor scanned the pet's QR tag" in x for x in lines[-2:]), lines[-3:])
check("... and moves the case to In progress", case_state.case_status_of(db.get(Report, ids["report"])) == "in_progress")
n = len(case_lines())
r, s = send(neighbour)
check("a second message on an In-progress case adds its line but no status change line", len(case_lines()) == n + 1
      and case_state.case_status_of(db.get(Report, ids["report"])) == "in_progress")
set_case("closed")
n = len(case_lines())
r, s = send(neighbour)
check("a message on a closed case is still delivered but changes nothing on the case", r.status_code == 200 and len(case_lines()) == n
      and case_state.case_status_of(db.get(Report, ids["report"])) == "closed")
check("still no message ever becomes a neighbour-visible sighting", db.query(LostPetSighting).count() == 0)

# A pet with no open lost notice: the owner is told, and no case changes
from app.models.notification import Notification  # noqa: E402

plain_token = client.post(f"/pets/{untagged.pet_id}/tag", headers=H(owner)).json().get("token") or     client.get(f"/pets/{untagged.pet_id}/tag", headers=H(owner)).json()["token"]
db.expire_all()
lines_before = db.query(StatusHistory).count()
statuses_before = [(r.report_id, r.case_status) for r in db.query(Report).order_by(Report.report_id).all()]
notes_before = db.query(Notification).filter(Notification.user_id == owner.user_id, Notification.type == "pet_tag_found").count()
for who in (None, neighbour):
    r = client.post(f"/t/{plain_token}/found", json={"location_label": "By the park"}, headers=H(who) if who else {})
    check(f"a message about a pet with no open notice is accepted ({'guest' if who is None else 'neighbour'})", r.status_code == 200, r.text)
db.expire_all()
check("... no case history line is written", db.query(StatusHistory).count() == lines_before)
check("... no case status changes", [(r.report_id, r.case_status) for r in db.query(Report).order_by(Report.report_id).all()] == statuses_before)
check("... the messages are not filed under any alert",
      all(x.alert_id is None for x in db.query(PetTagScan).filter(PetTagScan.pet_id == untagged.pet_id, PetTagScan.kind == "found_report")))
check("... and the owner is notified once per message",
      db.query(Notification).filter(Notification.user_id == owner.user_id, Notification.type == "pet_tag_found").count() == notes_before + 2)

# --- QR_TAG_SCAN_TO_CASE_PLAN phase 2: the case list carries the counts the Leader's Dashboard needs
import json  # noqa: E402
from datetime import datetime  # noqa: E402
from app.services import case_summaries as CS  # noqa: E402
from app.services import pet_tags as T  # noqa: E402


def row():
    db.expire_all()
    return next(x for x in CS.case_summaries(db, leader)["items"] if x["report_id"] == ids["report"])


set_alert("active")
set_case("reported")
T.resolve_scans(db, db.get(Pet, PET))
db.commit()
check("no unresolved message: no tag counts on the case row", row()["tag_messages"] is None, row()["tag_messages"])
sent_at = datetime.utcnow()
r, s = send(note="Calm, sitting by the gate.")
tm = row()["tag_messages"]
check("a guest message is counted: open 1, unseen 1, from a guest 1", r.status_code == 200 and tm and (tm["open"], tm["unseen"], tm["from_guest"]) == (1, 1, 1), tm)
check("... and its time is sent as UTC with a Z", tm and tm["oldest_unseen_at"].endswith("Z")
      and abs((datetime.fromisoformat(tm["oldest_unseen_at"][:-1]) - sent_at).total_seconds()) < 60, tm)
check("... and the row carries no place, note or phone", all(x not in json.dumps(row(), default=str) for x in ("Near the gate", "Calm, sitting")))
r, s = send(neighbour)
tm = row()["tag_messages"]
check("a neighbour's message adds to open and unseen, not to guests", tm and (tm["open"], tm["unseen"], tm["from_guest"]) == (2, 2, 1), tm)
client.get(f"/pets/{PET}/tag/scans", headers=H(owner))
tm = row()["tag_messages"]
check("once the owner opens them: still open (badge), no longer unseen (no nudge)", tm and (tm["open"], tm["unseen"], tm["oldest_unseen_at"]) == (2, 0, None), tm)
T.resolve_scans(db, db.get(Pet, PET))
db.commit()
check("resolved messages drop out of the row", row()["tag_messages"] is None)
check("other cases carry no tag counts", all(x["tag_messages"] is None for x in CS.case_summaries(db, leader)["items"] if x["report_id"] != ids["report"]))

# --- QR_TAG_SCAN_TO_CASE_PLAN phase 3: the owner answers a message
from datetime import timedelta  # noqa: E402
set_alert("active")
set_case("reported")
T.resolve_scans(db, db.get(Pet, PET))
for old in db.query(PetTagScan).filter(PetTagScan.pet_id == PET):      # the earlier sections' messages leave the 10-per-hour window
    old.created_at = old.created_at - timedelta(hours=2)
db.commit()


def latest_scan():
    db.expire_all()
    return db.query(PetTagScan).filter(PetTagScan.pet_id == PET, PetTagScan.kind == "found_report").order_by(PetTagScan.scan_id.desc()).first()


def answer(scan_id, body):
    r = client.post(f"/pets/{PET}/tag/scans/{scan_id}/resolve", json=body, headers=H(owner))
    db.expire_all()
    return r


send()
s1 = latest_scan()
n = len(case_lines())
r = answer(s1.scan_id, {"answer": "not_yet"})
lines = case_lines()
check("'Not yet' resolves the message", r.status_code == 200 and latest_scan().status == "resolved", r.text)
check("... writes one neutral line on the case", len(lines) == n + 1 and lines[-1] == "The owner checked a QR tag message: the pet is not home yet.", lines[-2:])
check("... and recovers nothing: the pet is still Lost, the notice still active, the case not closed",
      db.get(Pet, PET).status == "Lost" and db.get(LostPetAlert, ALERT).status == "active"
      and case_state.case_status_of(db.get(Report, ids["report"])) != "closed")
check("... and the Dashboard counts drop to none", row()["tag_messages"] is None)
send(neighbour)
s2 = latest_scan()
n = len(case_lines())
r = answer(s2.scan_id, {"answer": "not_real"})
lines = case_lines()
check("'This isn't real' closes the message as 'Not the pet' (dismissed) and writes its own line", r.status_code == 200 and latest_scan().status == "dismissed"
      and len(lines) == n + 1 and lines[-1] == "The owner said a QR tag message was not about their pet.", lines[-2:])
check("... and the pet is still Lost", db.get(Pet, PET).status == "Lost")
send()
send(neighbour)
n = len(case_lines())
r = client.post(f"/pets/{PET}/tag/scans/resolve", json={"answer": "not_real"}, headers=H(owner))
lines = case_lines()
check("answering several at once writes one line that says how many", r.status_code == 200 and r.json()["resolved"] == 2
      and len(case_lines()) == n + 1 and lines[-1] == "The owner said 2 QR tag messages were not about their pet.", lines[-2:])
check("an unknown answer is refused", answer(s2.scan_id, {"answer": "maybe"}).status_code == 422)
send()
s3 = latest_scan()
check("only the owner can answer (the Leader cannot)",
      client.post(f"/pets/{PET}/tag/scans/{s3.scan_id}/resolve", json={"answer": "not_real"}, headers=H(leader)).status_code in (403, 404))
check("... and the message stays open", latest_scan().status != "resolved")
plain_scan = db.query(PetTagScan).filter(PetTagScan.pet_id == untagged.pet_id, PetTagScan.kind == "found_report").first()
n = len(case_lines())
r = client.post(f"/pets/{untagged.pet_id}/tag/scans/{plain_scan.scan_id}/resolve", json={"answer": "not_real"}, headers=H(owner))
check("a pet with no open notice: the answer clears the message and writes no case line", r.status_code == 200 and len(case_lines()) == n)

# --- Guest photos: a stranger who scanned the tag can attach one photo, through the tag's own upload
import app.utils.cloudinary_config as CC  # noqa: E402

uploaded = []


def fake_upload(content, folder="straysafe", resource_type="auto", filename=None):
    uploaded.append((folder, resource_type, len(content)))
    return f"https://res.cloudinary.com/demo/image/upload/v1/{folder}/guest{len(uploaded)}.png"


CC.upload_to_cloudinary = fake_upload
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000") + b"\x00" * 40
for old in db.query(PetTagScan).filter(PetTagScan.pet_id == PET):      # leave the 10-per-hour window of the earlier sections
    old.created_at = old.created_at - timedelta(hours=3)
db.commit()
r = client.post(f"/t/{token}/photo", files={"file": ("pet.png", PNG, "image/png")})
check("a guest can upload one photo through the tag", r.status_code == 200 and r.json()["url"].endswith(".png"), r.text)
check("... stored in the tag's own folder as an image", uploaded and uploaded[-1][0] == T.FOUND_PHOTO_FOLDER and uploaded[-1][1] == "image", uploaded)
guest_url = r.json().get("url")
check("a non-image is refused before any upload",
      client.post(f"/t/{token}/photo", files={"file": ("notes.txt", b"hello there", "text/plain")}).status_code in (400, 415) and len(uploaded) == 1)
check("an unknown tag gets no upload", client.post("/t/nosuchtoken000000000/photo", files={"file": ("pet.png", PNG, "image/png")}).status_code == 404
      and len(uploaded) == 1)
r, s = send(photo_url=guest_url)
check("a guest's message can carry the photo uploaded through the tag", r.status_code == 200 and s.photo_url == guest_url and s.scanner_user_id is None, r.text)
check("a guest's photo link from anywhere else is still refused",
      send(photo_url="https://res.cloudinary.com/demo/image/upload/v1/straysafe/chat/x.png")[0].status_code == 422)
owner_view = client.get(f"/pets/{PET}/tag/scans", headers=H(owner)).json()["found_reports"]
check("the owner sees the guest's photo (marked as from a guest)",
      any(c["photo_url"] == guest_url and c["from_signed_in_resident"] is False for c in owner_view))
r = client.post(f"/pets/{PET}/tag/scans/{s.scan_id}/resolve", json={"answer": "not_yet"}, headers=H(owner))
db.expire_all()
check("'Not yet' keeps the photo", r.status_code == 200 and db.get(PetTagScan, s.scan_id).photo_url == guest_url)
r = client.post(f"/t/{token}/photo", files={"file": ("pet.png", PNG, "image/png")})
r2, s2 = send(photo_url=r.json()["url"])
r = client.post(f"/pets/{PET}/tag/scans/{s2.scan_id}/resolve", json={"answer": "not_real"}, headers=H(owner))
db.expire_all()
check("'This isn't real' removes the photo link", r.status_code == 200 and db.get(PetTagScan, s2.scan_id).photo_url is None)

# --- The message states: New -> Viewed -> Pet returned / Not the pet ("Done" otherwise)
from app.models.pet_tag import CLOSED_SCAN_STATUSES  # noqa: E402
check("the closed states are Done, Pet returned and Not the pet", set(CLOSED_SCAN_STATUSES) == {"resolved", "returned", "dismissed"})
for old in db.query(PetTagScan).filter(PetTagScan.pet_id == PET):
    old.created_at = old.created_at - timedelta(hours=3)
db.commit()
set_alert("active")
set_case("reported")
T.resolve_scans(db, db.get(Pet, PET))
db.commit()
send()
s_open = latest_scan()
check("a new message reads New", s_open.status == "new")
client.get(f"/pets/{PET}/tag/scans", headers=H(owner))
db.expire_all()
check("the owner opening it makes it Viewed", db.get(PetTagScan, s_open.scan_id).status == "seen_by_owner")
check("a Viewed message still counts as open on the Dashboard", row()["tag_messages"] and row()["tag_messages"]["open"] == 1)
n = T.resolve_scans(db, db.get(Pet, PET), status="returned")
db.commit()
db.expire_all()
check("closing as Pet returned is stored as 'returned' and leaves the Dashboard", n == 1 and db.get(PetTagScan, s_open.scan_id).status == "returned" and row()["tag_messages"] is None)
check("a closed message is not closed again", T.resolve_scans(db, db.get(Pet, PET)) == 0)

db.close()
print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
