"""
B1 trust rule: an identity a report only INHERITED from its merged case is shown everywhere, but it doesn't count for
consequential actions (bite/chase history, owner warnings, ownership proof at handover) until staff re-check it.
Also: verify-incident requires a signed-in officer.
Run from the backend folder:  python tests/test_trust_rule.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "trust_rule_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-trust-rule-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, reports, warnings  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.owner_returns import owner_already_on_record  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (reports.router, matches.router, warnings.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


res, owner, leader, leader2 = mk("Res", 1), mk("Owner", 1), mk("Leader", 2), mk("Other Leader", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO, HL2, HR = H(LEADER, 2), H(OWNER, 1), H(leader2.user_id, 2), H(res.user_id, 1)
results = []
CLOCK = [datetime(2026, 9, 1)]


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report():
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed="Aspin", assigned_leader_id=LEADER, created_at=CLOCK[0], ai_suggested_risk_level="Low")
    db.add(r)
    db.commit()
    return r.report_id


def get(rid):
    db.expire_all()
    return db.get(Report, rid)


def pet_row(pid):
    db.expire_all()
    return db.get(Pet, pid)


pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=OWNER, status="Active")
db.add(pet)
db.commit()
PET = pet.pet_id
R1, R15 = report(), report()
m = ReportMatch(source_report_id=R1, matched_pet_id=PET, similarity_score=95, status="AI_SUGGESTED")
db.add(m)
db.commit()
client.post(f"/matches/{m.match_id}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
client.post(f"/matches/{m.match_id}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)
client.post("/reports/merge-group", json={"report_ids": [R1, R15], "notes": "same dog, checked photos"}, headers=HL)
check("setup: Report #15 inherited Boyet", get(R15).pet_id == PET and get(R15).pet_inherited_from_match_id == m.match_id)

# verify-incident security
bite = {"notes": "bit a child at the gate", "verified_actual_bite": True, "behavior_finding": "Substantiated"}
check("verify-incident requires sign-in", client.post(f"/reports/{R15}/verify-incident", json=bite).status_code == 401)
check("...and a resident can't do it (even sending a leader's user_id)",
      client.post(f"/reports/{R15}/verify-incident", json={**bite, "user_id": LEADER}, headers=HR).status_code == 403)

# D3: bite on the inherited report doesn't count until re-checked
r = client.post(f"/reports/{R15}/verify-incident", json=bite, headers=HL)
check("the handling leader verifies the bite on Report #15", r.status_code == 200, r.text[:200])
check("D3 Boyet's bite count is NOT changed by an inherited identity", (pet_row(PET).bite_incident_count or 0) == 0 and not pet_row(PET).has_bite_history,
      pet_row(PET).bite_incident_count)

# D4: no ownership proof by the record
check("D4 the inherited link is not proof of ownership at handover", owner_already_on_record(get(R15), OWNER, db) is False)
check("D4 ...the report's own confirmation still is", owner_already_on_record(get(R1), OWNER, db) is True)

# D5: warnings don't auto-fill an inherited pet
w = {"user_id": OWNER, "report_id": R15, "warning_level": "Notice", "violation_type": "Free-Roaming Unleashed", "description": "roaming"}
r = client.post("/warnings/", json=w, headers=HL)
check("D5 a warning can't auto-fill the inherited pet", r.status_code == 409 and "re-check" in r.text, r.text[:200])

# The report says so
body = client.get(f"/reports/{R15}", headers=HL).json()
check("the report detail says the identity is inherited and not trusted yet",
      body.get("pet_inherited_from_report_id") == R1 and body.get("pet_link_trusted") is False, {k: body.get(k) for k in ("pet_inherited_from_report_id", "pet_link_trusted")})

# Re-check
check("re-check needs a real reason", client.post(f"/reports/{R15}/recheck-identity", json={"note": "ok"}, headers=HL).status_code == 400)
check("re-check needs sign-in", client.post(f"/reports/{R15}/recheck-identity", json={"note": "same scar seen in person"}).status_code == 401)
check("another leader (not handling the case) can't re-check", client.post(f"/reports/{R15}/recheck-identity", json={"note": "same scar seen in person"}, headers=HL2).status_code == 403)
check("a report with its own confirmation doesn't need one", client.post(f"/reports/{R1}/recheck-identity", json={"note": "same scar seen in person"}, headers=HL).status_code == 400)
r = client.post(f"/reports/{R15}/recheck-identity", json={"note": "same scar and red collar, seen in person"}, headers=HL)
check("the handling leader re-checks the identity", r.status_code == 200, r.text[:200])
check("after the re-check the bite counts toward Boyet", pet_row(PET).bite_incident_count == 1 and pet_row(PET).has_bite_history)
check("...ownership proof by record now applies", owner_already_on_record(get(R15), OWNER, db) is True)
r = client.post("/warnings/", json=w, headers=HL)
check("...and a warning can be issued", r.status_code == 200, r.text[:200])
body = client.get(f"/reports/{R15}", headers=HL).json()
check("the report shows who re-checked it", body.get("pet_link_trusted") is True and body.get("identity_rechecked_by_name") == "Leader")

# Wrong merge corrected: the re-checked bite leaves Boyet's record again
r = client.post(f"/reports/{R15}/unmerge", json={"reason": "different dog after all, separating"}, headers=HL)
check("unmerge works", r.status_code == 200, r.text[:200])
check("the inherited link and its re-check are removed", get(R15).pet_id is None and get(R15).identity_rechecked_at is None)
check("Boyet's bite count goes back down", pet_row(PET).bite_incident_count == 0 and not pet_row(PET).has_bite_history, pet_row(PET).bite_incident_count)

# A report's own confirmed bite always counted (unchanged behaviour)
r = client.post(f"/reports/{R1}/verify-incident", json=bite, headers=HL)
check("a bite on the report with its own confirmation counts right away", r.status_code == 200 and pet_row(PET).bite_incident_count == 1, r.text[:200])

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
