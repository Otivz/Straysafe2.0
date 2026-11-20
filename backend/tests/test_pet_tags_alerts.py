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

db.close()
print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
