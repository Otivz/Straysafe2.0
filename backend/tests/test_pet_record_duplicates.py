"""
PET_RECORD_DUPLICATE_PREVENTION_PLAN.md (no AI: exact comparisons, a person confirms).
  C. Staff see possible duplicate records (same owner phone across account / no-account, or same owner + pet name),
     can merge them (existing tool) or mark them as different pets.
  A. A resident registering a pet that their subdivision registered for them (same number, same type) is asked first;
     "No, register a new pet" creates it and stops the pair from being flagged.
  B. "This is my pet" creates a claim the leader approves (the pet moves to the account) or declines (nothing changes).
     The resident can't accept their own claim, and never sees another owner's details.
Run from the backend folder:  python tests/test_pet_record_duplicates.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "pet_record_duplicates_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pet-duplicates-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import pet_ownership, pets  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(pets.router)
api.include_router(pet_ownership.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.flush()


def mk(name, role, phone=None):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=1, barangay_id=1, phone=phone)
    db.add(u)
    db.flush()
    return u


leader = mk("Leo Leader", 2)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def leader_registers(name, contact, phone, kind="Dog"):
    r = client.post("/pets/", headers=H(leader), json={"pet_name": name, "pet_type": kind, "owner_id": None, "status": "Active",
                                                      "emergency_contact_name": contact, "emergency_contact_phone": phone})
    assert r.status_code in (200, 201), r.text
    return r.json()["pet_id"]


bantay = leader_registers("Bantay", "Ramirez Ramos", "0977 032 8167")
other_dog = leader_registers("Whitey", "Someone Else", "0918 111 2222")
ramirez = mk("Ramirez Ramos", 1, phone="09770328167")
db.commit()

# ---- A. registration asks first ----
r = client.get("/pets/existing-for-me", params={"pet_type": "Dog"}, headers=H(ramirez))
cands = r.json().get("candidates", [])
check("A the check finds the dog held for him (same number, same type)", [c["pet_id"] for c in cands] == [bantay], cands)
check("A ...and shows the pet only, not the record's owner details", cands and "emergency_contact_phone" not in cands[0]
      and "owner_phone" not in cands[0] and "Someone Else" not in r.text)
check("A a cat registration finds nothing (different type)", client.get("/pets/existing-for-me", params={"pet_type": "Cat"},
                                                                         headers=H(ramirez)).json()["candidates"] == [])
r = client.post("/pets/", headers=H(ramirez), json={"pet_name": "Ban-ban", "pet_type": "Dog", "status": "Active"})
check("A registering without answering is refused with the offer (409)", r.status_code == 409
      and r.json()["detail"]["code"] == "EXISTING_PET_FOR_YOU", r.text[:200])
check("A ...and no second record was created", db.query(Pet).filter(Pet.owner_id == ramirez.user_id).count() == 0)

# ---- B. "This is my pet" -> the leader approves ----
r = client.post("/pet-ownership/claim", headers=H(ramirez), json={"pet_id": bantay})
check("B the claim is created", r.status_code == 200 and r.json()["status"] == "Pending", r.text[:200])
claim_id = r.json()["confirmation_id"]
check("B a resident can't claim someone else's held pet", client.post("/pet-ownership/claim", headers=H(ramirez),
                                                                       json={"pet_id": other_dog}).status_code == 404)
check("B the claim is not in his 'confirm ownership' list", client.get("/pet-ownership/mine", headers=H(ramirez)).json() == [])
check("B ...and he can't accept it himself (403)", client.post(f"/pet-ownership/{claim_id}/accept", headers=H(ramirez)).status_code == 403)
check("B he sees it as waiting", [c["pet_id"] for c in client.get("/pet-ownership/my-claims", headers=H(ramirez)).json()] == [bantay])
staff = client.get("/pet-ownership/claims", headers=H(leader)).json()
check("B the leader sees it, with the numbers matching", len(staff) == 1 and staff[0]["numbers_match"] is True, staff)
r = client.post(f"/pet-ownership/claims/{claim_id}/approve", headers=H(leader))
db.expire_all()
check("B approving puts the pet on his account", r.status_code == 200 and db.get(Pet, bantay).owner_id == ramirez.user_id, r.text[:200])
check("B ...the saved owner details stay as the emergency contact", db.get(Pet, bantay).emergency_contact_phone)
check("B approving twice is refused", client.post(f"/pet-ownership/claims/{claim_id}/approve", headers=H(leader)).status_code == 400)

# a declined claim changes nothing
mila = mk("Mila Moreno", 1, phone="09185556666")
db.commit()
cat = leader_registers("Muning", "Mila Moreno", "0918 555 6666", kind="Cat")
cid = client.post("/pet-ownership/claim", headers=H(mila), json={"pet_id": cat}).json()["confirmation_id"]
check("B declining needs a reason", client.post(f"/pet-ownership/claims/{cid}/decline", headers=H(leader), json={"reason": ""}).status_code == 422)
r = client.post(f"/pet-ownership/claims/{cid}/decline", headers=H(leader), json={"reason": "Different cat, white paws"})
db.expire_all()
check("B a declined claim leaves the pet as it was", r.status_code == 200 and db.get(Pet, cat).owner_id is None)

# ---- A. "No, register a new pet" ----
r = client.post("/pets/", headers=H(mila), json={"pet_name": "Tiger", "pet_type": "Cat", "status": "Active", "confirm_new_pet": True})
check("A 'register a new pet' creates it", r.status_code in (200, 201), r.text[:200])
tiger = r.json().get("pet_id")

# ---- C. staff duplicate flag ----
def pairs():
    return client.get("/pets/possible-duplicates", headers=H(leader)).json()["pairs"]


ids = [sorted(p["pets"][i]["pet_id"] for i in range(2)) for p in pairs()]
check("C the pair the owner said is different is not flagged", sorted([cat, tiger]) not in ids, ids)
# a duplicate that got through (no number on his account): same owner name + same pet name
noel = mk("Noel Navarro", 1)
db.commit()
held = leader_registers("Choco", "Noel Navarro", "0917 999 0000")
r = client.post("/pets/", headers=H(noel), json={"pet_name": "Choco", "pet_type": "Dog", "status": "Active"})
check("C (no number on his account, so registration can't match it)", r.status_code in (200, 201), r.text[:200])
dup = r.json()["pet_id"]
rows = pairs()
row = next((p for p in rows if sorted(x["pet_id"] for x in p["pets"]) == sorted([held, dup])), None)
check("C staff see the pair as a possible duplicate", row is not None and "Same owner name and pet name" in row["reasons"], rows)
check("C ...suggesting to keep the record with the account", row and row["suggested_keep_pet_id"] == dup, row)
check("C residents can't see the list (403)", client.get("/pets/possible-duplicates", headers=H(noel)).status_code == 403)
r = client.post(f"/pets/{held}/merge-into", headers=H(leader), json={"keep_pet_id": dup, "reason": "Same dog, owner signed up later"})
check("C a leader still can't merge into a resident's pet on their own (existing rule)", r.status_code == 403, r.status_code)
r = client.post("/pets/possible-duplicates/merge-request", headers=H(leader),
                json={"dup_pet_id": held, "keep_pet_id": dup, "reason": "Same dog, owner signed up later"})
check("C instead the leader asks the owner", r.status_code == 200, r.text[:200])
row = next((p for p in pairs() if sorted(x["pet_id"] for x in p["pets"]) == sorted([held, dup])), None)
check("C ...the pair shows 'owner asked'", row and row["owner_asked"] is True, row)
r = client.post("/pets/possible-duplicates/merge-request", headers=H(leader),
                json={"dup_pet_id": held, "keep_pet_id": dup, "reason": "Same dog again here"})
check("C asking again within 5 minutes is refused (429), with the wait", r.status_code == 429 and "minute" in r.text, r.text[:200])
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.utils import pet_duplicates  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402
reqs = db.query(AuditLog).filter(AuditLog.action == pet_duplicates.MERGE_REQUEST_ACTION).all()
check("C ...and no second request was made", len(reqs) == 1, len(reqs))
cand = next((c for c in client.get(f"/pets/{held}/merge-candidates", headers=H(leader)).json()["candidates"] if c["pet_id"] == dup), None)
check("C the picker shows the earlier ask, reminder not yet allowed",
      cand and cand["owner_request"] and cand["owner_request"]["can_remind"] is False and cand["owner_request"]["seconds_until_remind"] > 0, cand)
# six minutes pass
reqs[0].new_values = {**reqs[0].new_values, "asked_at": (datetime.now() - timedelta(minutes=6)).isoformat()}
db.commit()
notes_before = db.query(Notification).filter(Notification.user_id == noel.user_id).count()
r = client.post("/pets/possible-duplicates/merge-request", headers=H(leader), json={"dup_pet_id": held, "keep_pet_id": dup})
check("C after 5 minutes it sends a reminder instead", r.status_code == 200 and r.json().get("reminded") is True, r.text[:200])
db.expire_all()
check("C ...still one request", db.query(AuditLog).filter(AuditLog.action == pet_duplicates.MERGE_REQUEST_ACTION).count() == 1)
check("C ...the owner got one reminder notification",
      db.query(Notification).filter(Notification.user_id == noel.user_id).count() == notes_before + 1)
r = client.post("/pets/possible-duplicates/merge-request", headers=H(leader), json={"dup_pet_id": held, "keep_pet_id": dup})
check("C a second reminder right away is refused (the gap restarts)", r.status_code == 429, r.text[:200])
mine = client.get("/pets/merge-requests/mine", headers=H(noel)).json()
check("C the owner sees the request on My Pets", len(mine) == 1 and mine[0]["your_pet"]["pet_id"] == dup, mine)
check("C someone else can't answer it", client.post(f"/pets/merge-requests/{mine[0]['request_id']}/answer", headers=H(lito if 'lito' in dir() else ramirez),
                                                    json={"accept": True}).status_code == 403)
r = client.post(f"/pets/merge-requests/{mine[0]['request_id']}/answer", headers=H(noel), json={"accept": True})
db.expire_all()
check("C the owner agrees: the older record is merged into theirs", r.status_code == 200 and db.get(Pet, held).merged_into_pet_id == dup, r.text[:200])
check("C ...and the pair is no longer flagged", all(sorted(x["pet_id"] for x in p["pets"]) != sorted([held, dup]) for p in pairs()))
check("C ...and the request is answered", client.get("/pets/merge-requests/mine", headers=H(noel)).json() == [])
# "not the same pet"
lito = mk("Lito Lim", 1)
db.commit()
a = leader_registers("Bruno", "Lito Lim", "0917 123 4567")
b = client.post("/pets/", headers=H(lito), json={"pet_name": "Bruno", "pet_type": "Dog", "status": "Active"}).json()["pet_id"]
check("C a second pair is flagged", any(sorted(x["pet_id"] for x in p["pets"]) == sorted([a, b]) for p in pairs()))
r = client.post("/pets/possible-duplicates/merge-request", headers=H(leader), json={"dup_pet_id": a, "keep_pet_id": b, "reason": "Looks like the same Bruno"})
req_id = client.get("/pets/merge-requests/mine", headers=H(lito)).json()[0]["request_id"]
r = client.post(f"/pets/merge-requests/{req_id}/answer", headers=H(lito), json={"accept": False, "reason": "I have two dogs named Bruno"})
db.expire_all()
check("C the owner declines: both records stay", r.status_code == 200 and db.get(Pet, a).merged_into_pet_id is None)
check("C ...and the pair is no longer flagged", all(sorted(x["pet_id"] for x in p["pets"]) != sorted([a, b]) for p in pairs()))
sam = mk("Sam Santos", 1)
db.commit()
c1 = leader_registers("Kulot", "Sam Santos", "0917 765 4321")
c2 = client.post("/pets/", headers=H(sam), json={"pet_name": "Kulot", "pet_type": "Dog", "status": "Active"}).json()["pet_id"]
r = client.post("/pets/possible-duplicates/not-same", headers=H(leader), json={"pet_id_a": c1, "pet_id_b": c2, "reason": "Two dogs named Kulot"})
check("C 'not the same pet' by staff hides it", r.status_code == 200 and all(sorted(x["pet_id"] for x in p["pets"]) != sorted([c1, c2]) for p in pairs()))

# ---- the merge picker: suggestions and search (no Pet ID typing) ----
db.add_all([
    Pet(registered_by_user_id=leader.user_id, pet_name="Spot", pet_type="Dog", breed="Aspin", primary_color="Brown", owner_id=None, status="Active",
        emergency_contact_name="Dora Diaz", emergency_contact_phone="09170001111"),
    Pet(registered_by_user_id=leader.user_id, pet_name="Spotty", pet_type="Dog", breed="Aspin", primary_color="Brown", owner_id=None, status="Active"),
    Pet(registered_by_user_id=leader.user_id, pet_name="Mingming", pet_type="Cat", breed="Aspin", primary_color="Brown", owner_id=None, status="Active"),
])
db.commit()
spot = db.query(Pet).filter(Pet.pet_name == "Spot").first()
r = client.get(f"/pets/{spot.pet_id}/merge-candidates", headers=H(leader))
names = [c["pet_name"] for c in r.json()["candidates"]]
check("picker: records sharing breed and colour are suggested", r.status_code == 200 and "Spotty" in names, names)
top = next(c for c in r.json()["candidates"] if c["pet_name"] == "Spotty")
check("picker: ...with the shared facts listed", set(top["same_facts"]) >= {"Same breed", "Same main colour"}, top)
check("picker: a cat is never suggested for a dog", "Mingming" not in names)
r = client.get(f"/pets/{spot.pet_id}/merge-candidates", params={"q": "spotty"}, headers=H(leader))
check("picker: search by name finds it", [c["pet_name"] for c in r.json()["candidates"]] == ["Spotty"], r.json())
r = client.get(f"/pets/{spot.pet_id}/merge-candidates", params={"q": f"#{top['pet_id']}"}, headers=H(leader))
check("picker: search by Pet ID finds it", [c["pet_id"] for c in r.json()["candidates"]] == [top["pet_id"]], r.json())
own_a = client.post("/pets/", headers=H(sam), json={"pet_name": "Rex", "pet_type": "Dog", "breed": "Shih Tzu", "status": "Active"}).json()["pet_id"]
own_b = client.post("/pets/", headers=H(lito), json={"pet_name": "Rex", "pet_type": "Dog", "breed": "Shih Tzu", "status": "Active"}).json()["pet_id"]
rows = client.get(f"/pets/{own_a}/merge-candidates", headers=H(leader)).json()["candidates"]
other = next((c for c in rows if c["pet_id"] == own_b), None)
check("picker: a record with a different account owner is shown as blocked", other and other["blocked_reason"], other)
check("picker: residents can't use it (403)", client.get(f"/pets/{spot.pet_id}/merge-candidates", headers=H(sam)).status_code == 403)

# the merge reason is optional
spotty = db.query(Pet).filter(Pet.pet_name == "Spotty").first()
r = client.post(f"/pets/{spotty.pet_id}/merge-into", headers=H(leader), json={"keep_pet_id": spot.pet_id})
db.expire_all()
check("merging without a reason works", r.status_code == 200 and db.get(Pet, spotty.pet_id).merged_into_pet_id == spot.pet_id, r.text[:200])
from app.models.audit_log import AuditLog  # noqa: E402
logs = db.query(AuditLog).filter(AuditLog.target_table == "pets").all()
check("...and the log says no reason was given", any("No reason given" in ((l.description or "") + str(l.new_values or "")) for l in logs))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
