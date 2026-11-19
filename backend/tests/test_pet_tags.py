"""
Pet QR tags, Phase 1 (owner side): docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md.

Only the owner creates, replaces or prints a tag; the owner or the pet's Leader can see and turn it off; a pet has one
active tag; replacing a tag ends the old token; the token is random and not the pet id; the QR image holds the link.
Run from the backend folder:  python tests/test_pet_tags.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401  (throwaway SQLite, before any app import)

from fastapi.testclient import TestClient  # noqa: E402

from _isolated_db import build_app, create_schema_and_seed  # noqa: E402
from app.routes import pet_tags  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_tag import PetTag  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

# Cleared after the app imports, which may load .env.
os.environ.pop("PUBLIC_TAG_BASE_URL", None)
os.environ.pop("FRONTEND_URL", None)
client = TestClient(build_app(pet_tags.router), raise_server_exceptions=False)
ids = create_schema_and_seed()
db = SessionLocal()


def mk_user(name, role, subdivision_id=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@isolated.test", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subdivision_id, barangay_id=1)
    db.add(u)
    db.flush()
    return u


owner = db.get(User, ids["resident"])
neighbour = mk_user("Nina Neighbour", 1)
leader = db.get(User, ids["leader"])
other_leader = mk_user("Olga Other Leader", 2, subdivision_id=2)
staff = db.get(User, ids["staff"])
pet = Pet(pet_name="Bantay", pet_type="Dog", owner_id=owner.user_id, status="Active")
stray = Pet(pet_name="Stray", pet_type="Cat", owner_id=None, status="Active", registered_by_user_id=leader.user_id)
gone = Pet(pet_name="Old", pet_type="Dog", owner_id=owner.user_id, status="Deceased")
db.add_all([pet, stray, gone])
db.commit()
PET, STRAY, GONE = pet.pet_id, stray.pet_id, gone.pet_id


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}


results = []


def check(name, cond, extra=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))


def active_count(pet_id):
    db.expire_all()
    return db.query(PetTag).filter(PetTag.pet_id == pet_id, PetTag.status == "active").count()


# --- before any tag
r = client.get(f"/pets/{PET}/tag", headers=H(owner))
check("owner sees 'no tag' before creating one", r.status_code == 200 and r.json()["has_tag"] is False, r.text)
check("owner can manage, link not public without PUBLIC_TAG_BASE_URL", r.json()["can_manage"] is True and r.json()["link_is_public"] is False)
check("QR image before a tag exists is 404", client.get(f"/pets/{PET}/tag/qr.png", headers=H(owner)).status_code == 404)

# --- who may create
check("a neighbour cannot create a tag for someone else's pet", client.post(f"/pets/{PET}/tag", headers=H(neighbour)).status_code == 403)
check("the Leader cannot create a tag (owner only)", client.post(f"/pets/{PET}/tag", headers=H(leader)).status_code == 403)
check("no tag was created by refused requests", active_count(PET) == 0)
check("a pet without an owner cannot get a tag", client.post(f"/pets/{STRAY}/tag", headers=H(leader)).status_code == 403)
r = client.post(f"/pets/{GONE}/tag", headers=H(owner))
check("a deceased pet cannot get a tag (409)", r.status_code == 409, r.text)
check("missing pet is 404", client.post("/pets/99999/tag", headers=H(owner)).status_code == 404)

# --- create
r = client.post(f"/pets/{PET}/tag", headers=H(owner))
first = r.json()
check("owner creates a tag", r.status_code == 200 and first["has_tag"] is True, r.text)
token1 = first["token"]
check("token is random-looking and not the pet id", token1 and len(token1) >= 20 and str(PET) != token1)
check("link is <base>/t/<token>", first["link"] == f"http://localhost:5173/t/{token1}", first.get("link"))
check("one active tag", active_count(PET) == 1)
db.expire_all()
check("creation is in the audit log", db.query(AuditLog).filter(AuditLog.action == "PET_TAG_CREATED", AuditLog.target_id == PET).count() == 1)

# --- QR image
r = client.get(f"/pets/{PET}/tag/qr.png", headers=H(owner))
check("QR image is a PNG", r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content[:8] == b"\x89PNG\r\n\x1a\n")
check("QR image is not cached", r.headers.get("cache-control") == "no-store")
try:
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(r.content))
    check("QR image opens and is square", img.size[0] == img.size[1] and img.size[0] > 100, str(img.size))
except Exception as e:  # pragma: no cover
    check("QR image opens", False, str(e))
check("the Leader cannot download the QR image", client.get(f"/pets/{PET}/tag/qr.png", headers=H(leader)).status_code == 403)
check("a neighbour cannot download the QR image", client.get(f"/pets/{PET}/tag/qr.png", headers=H(neighbour)).status_code == 403)

# --- who may see
r = client.get(f"/pets/{PET}/tag", headers=H(leader))
check("the pet's Leader sees the tag", r.status_code == 200 and r.json()["has_tag"] is True, r.text)
check("the Leader cannot manage but can disable", r.json()["can_manage"] is False and r.json()["can_disable"] is True)
check("a neighbour cannot see the tag", client.get(f"/pets/{PET}/tag", headers=H(neighbour)).status_code == 403)
check("a Leader of another subdivision cannot see it", client.get(f"/pets/{PET}/tag", headers=H(other_leader)).status_code == 403)
check("retired barangay staff cannot see it", client.get(f"/pets/{PET}/tag", headers=H(staff)).status_code == 403)

# --- replace
r = client.post(f"/pets/{PET}/tag", headers=H(owner))
token2 = r.json()["token"]
check("replacing gives a new token", r.status_code == 200 and token2 and token2 != token1)
check("still exactly one active tag", active_count(PET) == 1)
db.expire_all()
old = db.query(PetTag).filter(PetTag.token == token1).one()
check("the old tag is marked replaced", old.status == "replaced" and old.disabled_at is not None and old.disabled_by == owner.user_id)
check("replacement is in the audit log", db.query(AuditLog).filter(AuditLog.action == "PET_TAG_REPLACED").count() == 1)

# --- disable
check("a neighbour cannot turn it off", client.post(f"/pets/{PET}/tag/disable", headers=H(neighbour)).status_code == 403)
check("another subdivision's Leader cannot turn it off", client.post(f"/pets/{PET}/tag/disable", headers=H(other_leader)).status_code == 403)
check("still active after refused turn-offs", active_count(PET) == 1)
r = client.post(f"/pets/{PET}/tag/disable", headers=H(leader))
check("the pet's Leader turns it off", r.status_code == 200 and r.json()["has_tag"] is False, r.text)
check("no active tag after turning off", active_count(PET) == 0)
db.expire_all()
t2 = db.query(PetTag).filter(PetTag.token == token2).one()
check("the tag is marked disabled by the Leader", t2.status == "disabled" and t2.disabled_by == leader.user_id)
check("turning off is in the audit log", db.query(AuditLog).filter(AuditLog.action == "PET_TAG_DISABLED").count() == 1)
r = client.post(f"/pets/{PET}/tag/disable", headers=H(owner))
check("turning off again is harmless", r.status_code == 200 and r.json()["has_tag"] is False)
check("QR image after turning off is 404", client.get(f"/pets/{PET}/tag/qr.png", headers=H(owner)).status_code == 404)

# --- owner re-creates; configured base url
os.environ["PUBLIC_TAG_BASE_URL"] = "https://tags.example.org/"
r = client.post(f"/pets/{PET}/tag", headers=H(owner))
j = r.json()
check("a new tag after turning off", r.status_code == 200 and j["has_tag"] and j["token"] not in (token1, token2))
check("PUBLIC_TAG_BASE_URL is used (trailing slash removed)", j["link"] == f"https://tags.example.org/t/{j['token']}" and j["link_is_public"] is True, j["link"])
os.environ.pop("PUBLIC_TAG_BASE_URL")
os.environ["FRONTEND_URL"] = "https://app.example.org"
check("FRONTEND_URL is the fallback", client.get(f"/pets/{PET}/tag", headers=H(owner)).json()["link"].startswith("https://app.example.org/t/"))
os.environ.pop("FRONTEND_URL")
check("every token is unique", db.query(PetTag.token).distinct().count() == db.query(PetTag).count())
check("signed-out requests are refused", client.get(f"/pets/{PET}/tag").status_code == 401)

db.close()
print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
