"""
Official resident records, bulk account creation and account claiming (docs/01-system/RESIDENT_RECORD_REGISTRATION.md):

  Leader: template download, upload (xlsx and csv), validation summary with row + reason, duplicate / invalid / missing detection,
          preview, one-click import (applied once), search, edit, deactivate / reactivate, history; access control
  Accounts: the import creates a locked resident account per record (Pending Activation, no usable password), links existing
          accounts as Active, queues one invitation each, sends them in the background, records failed deliveries and retries them
  Resident: the e-mailed link is single use, expires, is replaced by a new one, needs a policy-compliant password, activates the
          account exactly once (also under a double submit); expired / used / unknown links are refused; asking for a new link never
          reveals whether an address is on the list
  Leader: resend (cooldown), deactivate / reactivate (sign-in blocked, history kept), counts, activation history
  Old paths: public POST /users/ and a first Google sign-in no longer create accounts
  Scale: 5,000 rows validated and imported in chunks
Offline: a throwaway SQLite file (tests/_isolated_db.py); the e-mail sender is replaced and records what it was asked to send.
Run from the backend folder:  python tests/test_resident_registry.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

import threading
import time
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.limiter import limiter
from app.routes import resident_activation, resident_records, users
from app.services import resident_registry as svc

api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (resident_records.router, resident_activation.router, users.router):
    api.include_router(r)
ids = _isolated_db.create_schema_and_seed()
limiter.enabled = False

from app.database import SessionLocal  # noqa: E402
from app.models.resident_registry import OfficialResidentRecord, ResidentInvitation  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import resident_invitations as invites  # noqa: E402
from app.utils.auth import create_access_token, verify_password  # noqa: E402

client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0
sent = []                       # (to, link) for every invitation the app asked to e-mail
mail_ok = {"v": True}


def fake_send(to, name, link, hours, *args, **kwargs):
    sent.append((to, link))
    return mail_ok["v"]


invites.send_activation_invitation_email = fake_send


def token_of(link):
    return link.split("token=")[1]


def last_link(email):
    return next(link for to, link in reversed(sent) if to == email)


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


leader = db.get(User, ids["leader"])                  # role 2, subdivision 1
resident = db.get(User, ids["resident"])
admin = db.get(User, ids["admin"])
other_leader = User(name="Other Leader", email="other.leader@isolated.test", password="x", role_id=2, is_verified=True, status="Active",
                    subdivision_id=2, barangay_id=1)
db.add(other_leader)
legacy = User(name="Rita Resident", email="rita@example.com", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
staffer = User(name="Staff Person", email="staffer@example.com", password="x", role_id=3, is_verified=True, status="Active", barangay_id=1)
db.add_all([legacy, staffer])
db.commit()
LH, RH, AH, OH = H(leader), H(resident), H(admin), H(other_leader)


def upload(rows, name="residents.xlsx", headers=None, who=LH):
    table = [headers or svc.TEMPLATE_HEADERS] + rows
    if name.endswith(".csv"):
        import csv
        import io
        buf = io.StringIO()
        csv.writer(buf).writerows(table)
        data, mime = buf.getvalue().encode("utf-8"), "text/csv"
    else:
        data, mime = svc.build_xlsx(table), "application/octet-stream"
    return client.post("/resident-records/imports", files={"file": (name, data, mime)}, headers=who)


# ------------------------------------------------------------------------------------------------ access control + template
check("a resident cannot download the template", client.get("/resident-records/template", headers=RH).status_code == 403)
check("a resident cannot list the records", client.get("/resident-records", headers=RH).status_code == 403)
check("an administrator is not a Subdivision Leader here", client.get("/resident-records", headers=AH).status_code == 403)
check("no token, no access", client.get("/resident-records").status_code in (401, 403))
check("a resident cannot upload", upload([["A B", "a@b.com", "1", "1", ""]], who=RH).status_code == 403)
t = client.get("/resident-records/template?format=xlsx", headers=LH)
check("the xlsx template downloads and is readable by the importer", t.status_code == 200
      and svc.read_table("t.xlsx", t.content)[0][0] == svc.TEMPLATE_HEADERS)
t = client.get("/resident-records/template?format=csv", headers=LH)
check("the csv template downloads", t.status_code == 200 and b"Full Name" in t.content)

# ------------------------------------------------------------------------------------------------ validation
rows = [
    ["Maria Santos", "Maria.Santos@Example.com", "4", "21", "0917 123 4567"],      # 2 valid
    ["Juan Dela Cruz", "juan@example.com", "Block 5", "7", ""],                      # 3 valid
    ["Ana Reyes", "ana@example.com", "4", "22", "not a phone"],                      # 4 invalid contact
    ["Pedro Lim", "pedro-at-example.com", "4", "23", ""],                            # 5 invalid email
    ["", "nobody@example.com", "4", "24", ""],                                       # 6 missing name
    ["Maria Santos", "maria.santos@example.com", "9", "9", ""],                      # 7 duplicate email (row 2)
    ["Juan  dela cruz", "juan2@example.com", "5", "07", ""],                         # 8 duplicate identity (row 3)
    ["Rosa Diaz", "rosa@example.com", "6", "1", ""],                                 # 9 valid
    ["", "", "", "", ""],                                                            # blank: ignored
    ["Staff Person", "staffer@example.com", "7", "1", ""],                      # 11 invalid: staff e-mail
    ["Rita Resident", "rita@example.com", "8", "1", ""],                  # 12 valid, links existing account
]
res = upload(rows)
check("upload returns 200", res.status_code == 200, res.text)
b = res.json()
check("summary counts every non-blank row once", (b["total_rows"], b["valid_rows"], b["duplicate_rows"], b["invalid_rows"], b["missing_rows"]) == (10, 4, 2, 3, 1), b)
check("nothing is a resident record before the Leader confirms", db.query(OfficialResidentRecord).count() == 0)
issues = client.get(f"/resident-records/imports/{b['batch_id']}", headers=LH).json()
by_row = {r["row_number"]: r for r in issues["rows"]}
check("every problem lists its row number and reason", sorted(by_row) == [4, 5, 6, 7, 8, 11] and all(r["reason"] for r in by_row.values()), by_row)
check("row numbers match Excel (header = row 1)", by_row[4]["full_name"] == "Ana Reyes")
check("duplicate email names the earlier row", "row 2" in by_row[7]["reason"], by_row[7])
check("duplicate identity ignores case, spacing and zero padding", by_row[8]["result"] == "duplicate" and "row 3" in by_row[8]["reason"], by_row[8])
check("a staff e-mail is refused", by_row[11]["result"] == "invalid")
preview = client.get(f"/resident-records/imports/{b['batch_id']}?result=valid", headers=LH).json()
check("the preview lists exactly the valid rows", [r["row_number"] for r in preview["rows"]] == [2, 3, 9, 12], preview["rows"])
check("another subdivision's Leader cannot see this batch", client.get(f"/resident-records/imports/{b['batch_id']}", headers=OH).status_code == 404)
check("another subdivision's Leader cannot confirm it", client.post(f"/resident-records/imports/{b['batch_id']}/confirm", headers=OH).status_code == 404)

# file-level problems
bad = client.post("/resident-records/imports", files={"file": ("x.pdf", b"%PDF", "application/pdf")}, headers=LH)
check("an unsupported type is refused", bad.status_code == 400 and "Unsupported" in bad.json()["detail"])
bad = client.post("/resident-records/imports", files={"file": ("fake.xlsx", b"hello", "application/octet-stream")}, headers=LH)
check("a fake .xlsx is refused", bad.status_code == 400)
bad = upload([["x"]], headers=["Name", "Phone"])
check("missing required columns are named", bad.status_code == 400 and "Email Address" in bad.json()["detail"], bad.text)
bad = client.post("/resident-records/imports", files={"file": ("e.csv", b"", "text/csv")}, headers=LH)
check("an empty file is refused", bad.status_code == 400)
big = client.post("/resident-records/imports", files={"file": ("big.csv", b"x" * (svc.MAX_FILE_BYTES + 10), "text/csv")}, headers=LH)
check("an oversized file is refused", big.status_code == 400 and "MB" in big.json()["detail"])

# ------------------------------------------------------------------------------------------------ confirm
bid = b["batch_id"]
c1 = client.post(f"/resident-records/imports/{bid}/confirm", headers=LH)
check("confirm imports the valid rows", c1.status_code == 200 and c1.json()["imported"] == 4 and c1.json()["linked_existing"] == 1, c1.text)
check("invalid and duplicate rows did not become records", db.query(OfficialResidentRecord).count() == 4)
check("confirming again is refused (applied once)", client.post(f"/resident-records/imports/{bid}/confirm", headers=LH).status_code == 409)
check("a discarded/confirmed batch cannot be discarded", client.post(f"/resident-records/imports/{bid}/discard", headers=LH).status_code == 409)
db.expire_all()
linked = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.email == "rita@example.com").one()
check("a row whose e-mail already has a resident account is linked and treated as Active", linked.user_id == legacy.user_id and linked.registration_status == "Active")
maria = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.email == "maria.santos@example.com").one()
check("e-mail letter case is normalized and the record is Pending Activation", maria.registration_status == "Pending Activation" and maria.contact_number == "09171234567")

# re-uploading the same people: all duplicates now
again = upload(rows[:2]).json()
check("existing records are reported as duplicates on a second upload", again["duplicate_rows"] == 2 and again["valid_rows"] == 0, again)
d = client.post(f"/resident-records/imports/{again['batch_id']}/discard", headers=LH)
check("a validated batch can be discarded", d.status_code == 200 and d.json()["batch"]["status"] == "Discarded")
check("a discarded batch cannot be confirmed", client.post(f"/resident-records/imports/{again['batch_id']}/confirm", headers=LH).status_code == 409)
hist = client.get("/resident-records/imports", headers=LH).json()
check("history lists every upload with its status", [h["status"] for h in hist] == ["Discarded", "Imported"], hist)
csv_res = upload([["Carlo Bautista", "carlo@example.com", "10", "3", ""]], name="more.csv").json()
check("csv files validate too", csv_res["valid_rows"] == 1 and client.post(f"/resident-records/imports/{csv_res['batch_id']}/confirm", headers=LH).status_code == 200)

# ------------------------------------------------------------------------------------------------ management
lst = client.get("/resident-records?q=santos", headers=LH).json()
check("search by name", lst["total"] == 1 and lst["records"][0]["full_name"] == "Maria Santos")
check("search by block", client.get("/resident-records?q=Block 5", headers=LH).json()["total"] == 1)
check("search by lot", client.get("/resident-records?q=21", headers=LH).json()["total"] >= 1)
check("search by e-mail", client.get("/resident-records?q=rosa@", headers=LH).json()["total"] == 1)
check("a wildcard is searched literally", client.get("/resident-records?q=%25", headers=LH).json()["total"] == 0)
check("status counts are returned", client.get("/resident-records", headers=LH).json()["counts"]["Active"] == 1)
check("the other subdivision's Leader sees none of them", client.get("/resident-records", headers=OH).json()["total"] == 0)
rid = maria.record_id
p = client.patch(f"/resident-records/{rid}", json={"lot_number": "22", "full_name": "Maria S. Santos"}, headers=LH)
check("a record can be corrected", p.status_code == 200 and p.json()["lot_number"] == "22", p.text)
p = client.patch(f"/resident-records/{rid}", json={"email": "juan@example.com"}, headers=LH)
check("changing to an e-mail already on the list is refused", p.status_code == 409, p.text)
p = client.patch(f"/resident-records/{linked.record_id}", json={"email": "new@example.com"}, headers=LH)
check("the e-mail of a record with an account cannot change", p.status_code == 400)
check("a record of another subdivision cannot be edited", client.patch(f"/resident-records/{rid}", json={"lot_number": "1"}, headers=OH).status_code == 404)
check("a resident cannot deactivate", client.post(f"/resident-records/{rid}/deactivate", headers=RH).status_code == 403)

# ------------------------------------------------------------------------------------------------ accounts + invitations
first_batch_mail = sorted({to for to, _ in sent})
check("an invitation went to every new resident, and none to the linked existing account",
      first_batch_mail == ["carlo@example.com", "juan@example.com", "maria.santos@example.com", "rosa@example.com"], first_batch_mail)
mu = db.query(User).filter(User.email == "maria.santos@example.com").one()
check("the account was created locked: Inactive, not verified, resident role", mu.status == "Inactive" and not mu.is_verified and mu.role_id == 1)
check("its password is a hash nobody knows, never plaintext", mu.password.startswith("$2") and not verify_password("", mu.password))
check("the account carries the record's details", mu.name == "Maria S. Santos" or mu.name == "Maria Santos", mu.name)
check("the account is linked to its record", db.query(OfficialResidentRecord).filter(OfficialResidentRecord.email == mu.email).one().user_id == mu.user_id)
check("an existing resident account was not touched", db.get(User, legacy.user_id).status == "Active" and db.get(User, legacy.user_id).password == "x")
r = client.get("/resident-records", headers=H(mu))
check("a Pending Activation account cannot use protected features", r.status_code == 403 and "inactive" in r.text.lower(), r.text)
inv_rows = db.query(ResidentInvitation).all()
check("every invitation is Sent and only a hash of its link is stored",
      all(i.delivery_status == "Sent" and i.token_hash and len(i.token_hash) == 64 for i in inv_rows if i.record_id != linked.record_id), [i.delivery_status for i in inv_rows])
check("no invitation exists for the already-active resident", db.query(ResidentInvitation).filter(ResidentInvitation.record_id == linked.record_id).count() == 0)
check("no link or token appears in the Leader's list", "token" not in client.get("/resident-records", headers=LH).text.lower())

# a link
JUAN, MARIA = "juan@example.com", "maria.santos@example.com"
mlink = last_link(MARIA)
chk = client.get("/resident-activation/check", params={"token": token_of(mlink)})
check("a valid link is recognised and shows only the name and a masked e-mail", chk.status_code == 200 and chk.json()["full_name"] and "@" in chk.json()["masked_email"] and "maria.santos" not in chk.text, chk.text)
check("an unknown link is refused", client.get("/resident-activation/check", params={"token": "x" * 43}).status_code == 400)
PW = "Str0ng!Passw0rd#1"
r = client.post("/resident-activation/complete", json={"token": token_of(mlink), "password": PW, "confirm_password": PW + "x"})
check("mismatched passwords are refused", r.status_code == 400)
r = client.post("/resident-activation/complete", json={"token": token_of(mlink), "password": "short", "confirm_password": "short"})
check("a weak password is refused", r.status_code in (400, 422), r.text)
check("the link still works after those refusals", client.get("/resident-activation/check", params={"token": token_of(mlink)}).status_code == 200)
r = client.post("/resident-activation/complete", json={"token": token_of(mlink), "password": PW, "confirm_password": PW})
check("choosing a password activates the account", r.status_code == 200 and r.json()["status"] == "activated", r.text)
db.expire_all()
mu = db.query(User).filter(User.email == MARIA).one()
mrec = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.email == MARIA).one()
check("the account is Active and verified with the chosen password", mu.status == "Active" and mu.is_verified and verify_password(PW, mu.password))
check("the record is Active with an activation time", mrec.registration_status == "Active" and mrec.registered_at is not None)
inv = db.query(ResidentInvitation).filter(ResidentInvitation.record_id == mrec.record_id).one()
check("the invitation is Claimed and its token is gone", inv.delivery_status == "Claimed" and inv.token_hash is None and inv.claimed_at is not None)
check("a used link cannot be reused", client.post("/resident-activation/complete", json={"token": token_of(mlink), "password": PW, "confirm_password": PW}).status_code == 400)
check("a used link no longer checks as valid", client.get("/resident-activation/check", params={"token": token_of(mlink)}).status_code == 400)
check("the activated resident can use the API", client.get("/resident-records", headers=H(mu)).status_code == 403 and "inactive" not in client.get("/resident-records", headers=H(mu)).text.lower())
check("an activated resident cannot be sent another invitation",
      client.post(f"/resident-records/{mrec.record_id}/resend-invitation", headers=LH).status_code == 409)

# expiry and a new link
jrec = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.email == JUAN).one()
jlink = last_link(JUAN)
jinv = db.query(ResidentInvitation).filter(ResidentInvitation.record_id == jrec.record_id).one()
jinv.expires_at = datetime.now() - timedelta(minutes=1)
db.commit()
check("an expired link is rejected on check", client.get("/resident-activation/check", params={"token": token_of(jlink)}).status_code == 410)
check("an expired link cannot activate", client.post("/resident-activation/complete", json={"token": token_of(jlink), "password": PW, "confirm_password": PW}).status_code == 410)
lst = client.get("/resident-records?q=juan", headers=LH).json()["records"][0]
check("the Leader sees the invitation as expired", lst["invitation_status"] == "Invitation Expired", lst)
before = len(sent)
unknown = client.post("/resident-activation/request-link", json={"email": "nobody@example.com"})
active_one = client.post("/resident-activation/request-link", json={"email": MARIA})
check("asking for a link never reveals who is on the list", unknown.status_code == 200 and unknown.json() == active_one.json() and len(sent) == before)
jinv = db.query(ResidentInvitation).filter(ResidentInvitation.record_id == jrec.record_id).one()
jinv.last_sent_at = datetime.now() - timedelta(hours=1)
db.commit()
asked = client.post("/resident-activation/request-link", json={"email": " JUAN@example.com "})
check("a resident can ask for a new link, sent to the address on the record", asked.status_code == 200 and len(sent) == before + 1 and sent[-1][0] == JUAN, sent[-1])
check("the old link stops working once a new one is sent", client.get("/resident-activation/check", params={"token": token_of(jlink)}).status_code == 400)
again_asked = client.post("/resident-activation/request-link", json={"email": JUAN})
check("asking again at once sends nothing more (cooldown)", again_asked.status_code == 200 and len(sent) == before + 1)
check("the new link is valid", client.get("/resident-activation/check", params={"token": token_of(last_link(JUAN))}).status_code == 200)

# Leader resend
rosa = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.email == "rosa@example.com").one()
rl = client.post(f"/resident-records/{rosa.record_id}/resend-invitation", headers=LH)
check("a resend right after sending is refused (cooldown)", rl.status_code == 409, rl.text)
old_rosa = last_link("rosa@example.com")
rinv = db.query(ResidentInvitation).filter(ResidentInvitation.record_id == rosa.record_id).one()
rinv.last_sent_at = datetime.now() - timedelta(hours=1)
db.commit()
rl = client.post(f"/resident-records/{rosa.record_id}/resend-invitation", headers=LH)
check("the Leader can resend after the cooldown", rl.status_code == 200 and rl.json()["result"] == "sent" and sent[-1][0] == "rosa@example.com", rl.text)
check("the previous link no longer works", client.get("/resident-activation/check", params={"token": token_of(old_rosa)}).status_code == 400)
check("a resident cannot resend invitations", client.post(f"/resident-records/{rosa.record_id}/resend-invitation", headers=RH).status_code == 403)
check("another subdivision's Leader cannot resend", client.post(f"/resident-records/{rosa.record_id}/resend-invitation", headers=OH).status_code == 404)

# double submit: one winner
rtoken = token_of(last_link("rosa@example.com"))
results = []


def go():
    results.append(client.post("/resident-activation/complete", json={"token": rtoken, "password": PW, "confirm_password": PW}).status_code)


threads = [threading.Thread(target=go) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
check("simultaneous activation attempts produce exactly one activation", sorted(results).count(200) == 1, results)
db.expire_all()
check("and a consistent account state", db.get(User, rosa.user_id).status == "Active" and db.query(OfficialResidentRecord).get(rosa.record_id).registration_status == "Active")

# failed delivery and retry
mail_ok["v"] = False
fail = upload([["Dina Flores", "dina@example.com", "11", "2", "0917 555 0101"]], name="fail.csv").json()
fc = client.post(f"/resident-records/imports/{fail['batch_id']}/confirm", headers=LH)
check("an import still succeeds when e-mail delivery fails", fc.status_code == 200 and fc.json()["accounts_created"] == 1, fc.text)
dl = client.get("/resident-records?q=dina", headers=LH).json()
drec = dl["records"][0]
check("a failed delivery is reported honestly, never as sent", drec["invitation_status"] == "Delivery Failed" and drec["invitation_error"], drec)
check("failed invitations are counted", dl["failed_invitations"] == 1 and client.get("/resident-records?invitation=failed", headers=LH).json()["total"] == 1)
dinv = db.query(ResidentInvitation).filter(ResidentInvitation.record_id == drec["record_id"]).one()
check("no usable link exists for a delivery that failed", dinv.token_hash is None)
mail_ok["v"] = True
q = client.post("/resident-records/send-invitations", headers=LH)
check("failed invitations can be retried safely", q.status_code == 200 and q.json()["queued"] >= 1, q.text)
db.expire_all()
check("the retry delivers the invitation", client.get("/resident-records?q=dina", headers=LH).json()["records"][0]["invitation_status"] == "Sent")
check("retrying again sends nothing twice", client.post("/resident-records/send-invitations", headers=LH).json()["queued"] == 0)
check("a resident cannot trigger sending", client.post("/resident-records/send-invitations", headers=RH).status_code == 403)

# deactivate / reactivate
dtok = token_of(last_link("dina@example.com"))
dr = client.post(f"/resident-records/{drec['record_id']}/deactivate", headers=LH)
check("deactivating a pending resident blocks the account and the link", dr.status_code == 200 and dr.json()["registration_status"] == "Deactivated"
      and client.get("/resident-activation/check", params={"token": dtok}).status_code == 400)
ra = client.post(f"/resident-records/{drec['record_id']}/reactivate", headers=LH)
check("reactivating a never-activated resident returns to Pending Activation", ra.json()["registration_status"] == "Pending Activation" and ra.json()["invitation_status"] == "Pending Delivery", ra.text)
m_deact = client.post(f"/resident-records/{mrec.record_id}/deactivate", headers=LH)
db.expire_all()
check("deactivating an active resident blocks sign-in but keeps the record",
      m_deact.json()["registration_status"] == "Deactivated" and db.get(User, mu.user_id).status == "Suspended")
check("a deactivated account cannot use protected features", "suspended" in client.get("/resident-records", headers=H(mu)).text.lower())
m_re = client.post(f"/resident-records/{mrec.record_id}/reactivate", headers=LH)
db.expire_all()
check("reactivating restores the account", m_re.json()["registration_status"] == "Active" and db.get(User, mu.user_id).status == "Active")
hist = client.get(f"/resident-records/{mrec.record_id}/history", headers=LH)
check("the activation history lists what happened", hist.status_code == 200 and any(h["action"] == "RESIDENT_ACCOUNT_ACTIVATED" for h in hist.json()), hist.text)
counts = client.get("/resident-records", headers=LH).json()["counts"]
check("the status counts add up", counts["Active"] >= 3 and counts["Pending Activation"] >= 1, counts)

# ------------------------------------------------------------------------------------------------ old open sign-ups are closed
new = {"name": "New Person", "email": "newperson@test-mail.com", "password": "Str0ng!Passw0rd#1", "phone": "09171234567",
       "role_id": 1, "subdivision_id": 1, "address": "Somewhere"}
r = client.post("/users/", json=new)
check("public POST /users/ no longer creates a resident", r.status_code == 403 and db.query(User).filter(User.email == new["email"]).count() == 0, r.text)
r = client.post("/users/", json={**new, "role_id": 2}, headers=AH)
check("an administrator can still provision accounts", r.status_code == 200, r.text)

# ------------------------------------------------------------------------------------------------ scale
big_rows = [[f"Resident Number {i}", f"resident{i}@bulk.example.com", str(1 + i % 40), str(1 + i // 40), ""] for i in range(5000)]
t0 = time.time()
bu = upload(big_rows, name="bulk.csv")
check("5,000 rows validate", bu.status_code == 200 and bu.json()["valid_rows"] == 5000, bu.text[:200])
bc = client.post(f"/resident-records/imports/{bu.json()['batch_id']}/confirm", headers=LH)
check("5,000 rows import in chunks, each with its own account", bc.status_code == 200 and bc.json()["imported"] == 5000 and bc.json()["accounts_created"] == 5000, bc.text[:200])
check("and every account is locked until it is claimed", db.query(User).filter(User.email.like("%@bulk.example.com"), User.status == "Inactive").count() == 5000)
print(f"        5,000-row validate + import took {time.time() - t0:.1f}s")
rows_over = [["A Name", f"x{i}@over.example.com", "1", str(i), ""] for i in range(svc.MAX_ROWS + 1)]
over = upload(rows_over, name="over.csv")
check("more than the row limit is refused", over.status_code == 400 and "more than" in over.json()["detail"], over.text[:200])

print(f"\n{PASSED} checks passed.")
