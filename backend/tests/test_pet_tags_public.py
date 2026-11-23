"""
Pet QR tags, Phase 2 (public scan page and "tell the owner"): docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md.

The public card is an allow-list (no owner fields); an unknown, replaced or disabled token, or an inactive pet, leaks
nothing; rate limits per visitor and per tag; a guest's phone is stored only with consent; the owner is notified and sees
the history (with the phone), the Leader sees it without the phone; resolving clears the phone.
Run from the backend folder:  python tests/test_pet_tags_public.py
"""
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401  (throwaway SQLite, before any app import)

from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

from _isolated_db import build_app, create_schema_and_seed  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_tag import PetTag, PetTagScan  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import pet_tags  # noqa: E402
from app.services import pet_tags as T  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.push_categories import category_for, notification_link  # noqa: E402

os.environ.pop("ENABLE_PET_TAGS", None)
api = build_app(pet_tags.router, pet_tags.public_router)
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
client = TestClient(api, raise_server_exceptions=False)
ids = create_schema_and_seed()
db = SessionLocal()

owner = db.get(User, ids["resident"])
owner.phone = "09171112222"
owner.address = "Lot 5 Block 4, Private Street"
leader = db.get(User, ids["leader"])
neighbour = User(name="Nina Neighbour", email="nina@isolated.test", password="x", role_id=1, is_verified=True,
                 status="Active", subdivision_id=1, barangay_id=1)
db.add(neighbour)
pet = Pet(pet_name="Bantay", pet_type="Dog", breed="Aspin", owner_id=owner.user_id, status="Active",
          photo_url="https://res.cloudinary.com/demo/image/upload/bantay.jpg", health_condition="Heart murmur",
          notes="Private notes", registered_address="Lot 5 Block 4", emergency_contact_phone="09998887777",
          registered_latitude=14.5, registered_longitude=121.0)
db.add(pet)
db.commit()
PET = pet.pet_id


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}


results = []


def check(name, cond, extra=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))


def found(token, headers=None, **body):
    limiter.reset()                     # the per-visitor limit is tested on its own below
    body = {"location_label": "Near the clubhouse", **body}
    return client.post(f"/t/{token}/found", json=body, headers=headers or {})


token = client.post(f"/pets/{PET}/tag", headers=H(owner)).json()["token"]

# --- the public card
limiter.reset()
r = client.get(f"/t/{token}")
card = r.json()
check("a guest opens the card", r.status_code == 200, r.text)
check("the card is exactly the allow-list",
      set(card) == {"pet_name", "species", "breed", "photo_url", "subdivision_name", "is_lost", "viewer", "alert_id"}, sorted(card))
check("the card shows the pet and the subdivision",
      card["pet_name"] == "Bantay" and card["species"] == "Dog" and card["subdivision_name"] == "Selera Homes" and card["is_lost"] is False)
raw = r.text
for secret in ("09171112222", "Lot 5", "Private Street", "Heart murmur", "Private notes", "09998887777", "isolated.test",
               "Seed Resident", str(owner.user_id) + ","):
    check(f"the card never contains {secret!r}", secret not in raw)
check("a guest is 'guest'", card["viewer"] == "guest")
limiter.reset()
check("a signed-in neighbour is 'resident'", client.get(f"/t/{token}", headers=H(neighbour)).json()["viewer"] == "resident")
check("the owner is 'owner'", client.get(f"/t/{token}", headers=H(owner)).json()["viewer"] == "owner")
check("a bad sign-in token is treated as a guest", client.get(f"/t/{token}", headers={"Authorization": "Bearer junk"}).json()["viewer"] == "guest")
db.expire_all()
views = db.query(PetTagScan).filter(PetTagScan.kind == "view").all()
check("page views are recorded once per 10 minutes (and never the owner's)", len(views) == 1, len(views))

# --- the lost banner
pet_row = db.get(Pet, PET)
pet_row.status = "Lost"
db.commit()
limiter.reset()
check("a lost pet's card says so", client.get(f"/t/{token}").json()["is_lost"] is True)
pet_row.status = "Active"
db.commit()

# --- inactive tokens leak nothing
limiter.reset()
unknown = client.get("/t/doesnotexist123")
check("an unknown token is 404 'no longer active'", unknown.status_code == 404 and unknown.json()["detail"] == T.NOT_ACTIVE)
check("a too-long token is 404 too", client.get("/t/" + "x" * 40).status_code == 404)
old_token = token
token = client.post(f"/pets/{PET}/tag", headers=H(owner)).json()["token"]   # replace
r = client.get(f"/t/{old_token}")
check("a replaced token gives the same answer, without the pet", r.status_code == 404 and r.json() == unknown.json() and "Bantay" not in r.text)
check("a replaced token cannot send a message", found(old_token).status_code == 404)
pet_row.status = "Deceased"
db.commit()
r = client.get(f"/t/{token}")
check("an inactive pet's tag gives the same answer", r.status_code == 404 and "Bantay" not in r.text)
pet_row.status = "Active"
db.commit()
os.environ["ENABLE_PET_TAGS"] = "false"
check("ENABLE_PET_TAGS=false switches the public page off", client.get(f"/t/{token}").status_code == 404)
os.environ.pop("ENABLE_PET_TAGS")

# --- tell the owner: validation
check("a message needs a place or a location", found(token, location_label="").status_code == 422)
check("latitude without longitude is refused", found(token, latitude=14.5).status_code == 422)
check("an impossible location is refused", found(token, latitude=99, longitude=10).status_code == 422)
check("a phone number in the text is refused", found(token, note="call me 09171234567").status_code == 422)
check("an email in the place is refused", found(token, location_label="me@example.com").status_code == 422)
check("a too-long note is refused", found(token, note="x" * 501).status_code == 422)
check("sharing without a number is refused", found(token, share_contact=True).status_code == 422)
check("a bad phone number is refused", found(token, share_contact=True, finder_phone="12345").status_code == 422)
check("a guest cannot attach a photo that was not uploaded through the tag", found(token, photo_url="https://res.cloudinary.com/demo/image/upload/x.jpg").status_code == 422)
check("the owner cannot report their own pet", found(token, headers=H(owner)).status_code == 409)
db.expire_all()
check("refused messages store nothing", db.query(PetTagScan).filter(PetTagScan.kind == "found_report").count() == 0)

# --- tell the owner: a guest without consent, then with consent
before = db.query(Notification).filter(Notification.user_id == owner.user_id).count()
r = found(token, note="Calm, sitting by the gate.", finder_phone="09175556666", share_contact=False)
check("a guest's message is accepted", r.status_code == 200 and r.json()["ok"] is True, r.text)
check("the answer has no owner details", "09171112222" not in r.text and "Seed Resident" not in r.text)
db.expire_all()
s1 = db.query(PetTagScan).filter(PetTagScan.kind == "found_report").order_by(PetTagScan.scan_id).all()[-1]
check("without consent the phone is NOT stored", s1.finder_phone is None and s1.share_contact is False)
check("a guest's message has no user", s1.scanner_user_id is None and s1.status == "new")
r = found(token, location_label="Block 4 park", latitude=14.51, longitude=121.01, finder_phone="0917 555 6666", share_contact=True)
db.expire_all()
s2 = db.query(PetTagScan).filter(PetTagScan.kind == "found_report").order_by(PetTagScan.scan_id).all()[-1]
check("with consent the phone is stored (normalised)", r.status_code == 200 and s2.finder_phone == "09175556666" and s2.share_contact is True)
notes = db.query(Notification).filter(Notification.user_id == owner.user_id, Notification.type == "pet_tag_found").all()
check("the owner got one notification per message", len(notes) == 2 and before + 2 == db.query(Notification).filter(Notification.user_id == owner.user_id).count())
check("the notification points at the pet", notes[-1].related_id == PET and "Block 4 park" in notes[-1].message)
check("the notification never holds the finder's number", all("0917" not in (n.message or "") for n in notes))
check("pet_tag_found is pushed (pet matches category)", category_for("pet_tag_found") == "pet_matches")
check("a tap opens the resident's tag scan page", notification_link(1, "pet_tag_found", PET) == f"/resident-app/pets/{PET}/scans")

# --- a signed-in neighbour with a photo
r = found(token, headers=H(neighbour), photo_url="https://res.cloudinary.com/demo/image/upload/found.jpg")
db.expire_all()
s3 = db.query(PetTagScan).filter(PetTagScan.kind == "found_report").order_by(PetTagScan.scan_id).all()[-1]
check("a signed-in neighbour can attach a photo", r.status_code == 200 and s3.scanner_user_id == neighbour.user_id and s3.photo_url.endswith("found.jpg"), r.text)
check("a video is refused as the photo", found(token, headers=H(neighbour), photo_url="https://res.cloudinary.com/demo/video/upload/x.mp4").status_code == 400)
check("a non-Cloudinary photo is refused", found(token, headers=H(neighbour), photo_url="https://evil.example/x.jpg").status_code == 400)

# --- history
r = client.get(f"/pets/{PET}/tag/scans", headers=H(leader))
hist = r.json()
check("the Leader sees the messages", r.status_code == 200 and len(hist["found_reports"]) == 3, r.text)
check("the Leader never sees the phone", all(c["finder_phone"] is None for c in hist["found_reports"]) and any(c["phone_shared"] for c in hist["found_reports"]))
check("the Leader's reading does not mark them seen", all(c["status"] == "new" for c in hist["found_reports"]))
check("a neighbour cannot read the history", client.get(f"/pets/{PET}/tag/scans", headers=H(neighbour)).status_code == 403)
r = client.get(f"/pets/{PET}/tag/scans", headers=H(owner))
hist = r.json()
check("the owner sees the shared phone", any(c["finder_phone"] == "09175556666" for c in hist["found_reports"]))
check("newest first", hist["found_reports"][0]["photo_url"] is not None)
check("the view summary is there", hist["views"]["count"] >= 1 and hist["views"]["last_at"])
db.expire_all()
check("the owner's reading marks them seen", all(s.status == "seen_by_owner" for s in db.query(PetTagScan).filter(PetTagScan.kind == "found_report")))

# --- resolve
check("only the owner resolves", client.post(f"/pets/{PET}/tag/scans/{s2.scan_id}/resolve", headers=H(leader)).status_code == 403)
check("resolving an unknown message is 404", client.post(f"/pets/{PET}/tag/scans/99999/resolve", headers=H(owner)).status_code == 404)
r = client.post(f"/pets/{PET}/tag/scans/{s2.scan_id}/resolve", headers=H(owner))
db.expire_all()
check("resolving one clears its phone", r.status_code == 200 and db.get(PetTagScan, s2.scan_id).finder_phone is None and db.get(PetTagScan, s2.scan_id).status == "resolved")
r = client.post(f"/pets/{PET}/tag/scans/resolve", headers=H(owner))
check("'back home' resolves the rest", r.status_code == 200 and r.json()["resolved"] == 2, r.text)

# --- rate limits
limiter.reset()
codes = [client.post(f"/t/{token}/found", json={"location_label": "Gate"}).status_code for _ in range(4)]
check("a visitor may send 3 messages an hour, the 4th is 429", codes == [200, 200, 200, 429], codes)
limiter.reset()
codes = [client.get(f"/t/{token}").status_code for _ in range(31)]
check("a visitor may open the card 30 times a minute", codes[:30] == [200] * 30 and codes[30] == 429, codes[-3:])
# per tag: 10 messages in the last hour from anyone
db.expire_all()
tag_id = db.query(PetTag).filter(PetTag.token == token).one().tag_id
for _ in range(10):
    db.add(PetTagScan(tag_id=tag_id, pet_id=PET, kind="found_report", location_label="x", status="new", created_at=datetime.utcnow()))
db.commit()
check("a tag takes at most 10 messages an hour from everyone", found(token).status_code == 429)
db.query(PetTagScan).filter(PetTagScan.tag_id == tag_id, PetTagScan.kind == "found_report").update({PetTagScan.created_at: datetime.utcnow() - timedelta(hours=2)})
db.commit()
check("older messages do not count", found(token).status_code == 200)

# --- Phase 4: retention
old = datetime.utcnow() - timedelta(days=91)
recent_view = datetime.utcnow() - timedelta(days=89)
db.add_all([
    PetTagScan(tag_id=tag_id, pet_id=PET, kind="view", status="seen_by_owner", created_at=old),
    PetTagScan(tag_id=tag_id, pet_id=PET, kind="view", status="seen_by_owner", created_at=recent_view),
    PetTagScan(tag_id=tag_id, pet_id=PET, kind="found_report", location_label="old", status="new", created_at=old, finder_phone="09170000001", share_contact=True),
    PetTagScan(tag_id=tag_id, pet_id=PET, kind="found_report", location_label="leftover", status="resolved", created_at=old, finder_phone="09170000002", share_contact=True),
])
db.commit()
views_before = db.query(PetTagScan).filter(PetTagScan.kind == "view").count()
reports_before = db.query(PetTagScan).filter(PetTagScan.kind == "found_report").count()
result = T.cleanup_scans(db)
db.expire_all()
check("cleanup deletes only views older than 90 days", result["views_deleted"] >= 1
      and db.query(PetTagScan).filter(PetTagScan.kind == "view").count() == views_before - result["views_deleted"]
      and db.query(PetTagScan).filter(PetTagScan.kind == "view", PetTagScan.created_at < datetime.utcnow() - timedelta(days=90)).count() == 0
      and db.query(PetTagScan).filter(PetTagScan.kind == "view", PetTagScan.created_at == recent_view).count() == 1, result)
check("cleanup keeps every message, however old", db.query(PetTagScan).filter(PetTagScan.kind == "found_report").count() == reports_before)
check("cleanup clears a phone left on a resolved message", db.query(PetTagScan).filter(PetTagScan.location_label == "leftover").one().finder_phone is None and result["phones_cleared"] == 1)
check("cleanup keeps the phone on an open message", db.query(PetTagScan).filter(PetTagScan.location_label == "old").one().finder_phone == "09170000001")
check("running it again changes nothing", T.cleanup_scans(db) == {"views_deleted": 0, "phones_cleared": 0})

json.dumps(card)
db.close()
print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
