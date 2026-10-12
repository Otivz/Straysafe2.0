"""
Phone number format validation (Philippine mobile / landline) on every input that takes a phone number.
Run from the backend folder:  python tests/test_phone_validation.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "phone_validation_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-phone-validation-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime  # noqa: E402

from pydantic import ValidationError  # noqa: E402

from app.schemas.adoption import AdoptionApplyRequest  # noqa: E402
from app.schemas.auth import CompleteProfileRequest  # noqa: E402
from app.schemas.landmark import LandmarkCreate, LandmarkUpdate  # noqa: E402
from app.schemas.pet import PetCreate, PetUpdate  # noqa: E402
from app.schemas.pet_qr import QRScanSubmit  # noqa: E402
from app.schemas.user import AdminUserCreate, UserCreate, UserResponse, UserUpdate  # noqa: E402
from app.utils.phone import normalize_ph_phone  # noqa: E402

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def rejects(fn):
    try:
        fn()
        return False
    except (ValidationError, ValueError):
        return True


GOOD = {"0917 123 4567": "09171234567", "+63 917-123-4567": "09171234567", "639171234567": "09171234567",
        "9171234567": "09171234567", "(044) 815-1234": "0448151234", "02 8123 4567": "0281234567"}
for raw, want in GOOD.items():
    check(f"accepted and stored in one form: {raw!r}", normalize_ph_phone(raw) == want, normalize_ph_phone(raw))
for bad in ("0977843728", "12345", "0917abc4567", "+1 555 123 4567", "09171234567890", "0000000000"):
    check(f"rejected: {bad!r}", rejects(lambda b=bad: normalize_ph_phone(b)))
check("a landline is refused where only a mobile is allowed", rejects(lambda: normalize_ph_phone("(044) 815-1234", mobile_only=True)))
check("empty is fine when optional", normalize_ph_phone("  ") is None and normalize_ph_phone(None) is None)
check("empty is refused when required", rejects(lambda: normalize_ph_phone("", required=True)))

user = dict(name="A", email="a@test-mail.com", role_id=1)
check("registration stores the normalized number", UserCreate(**user, password="x", phone="0917-123-4567").phone == "09171234567")
check("registration refuses a bad number", rejects(lambda: UserCreate(**user, password="x", phone="12345")))
check("admin-created accounts are checked too", rejects(lambda: AdminUserCreate(**user, phone="12345")))
check("profile updates are checked", rejects(lambda: UserUpdate(phone="12345")) and UserUpdate(phone=None).phone is None)
check("completing a profile requires a valid number", rejects(lambda: CompleteProfileRequest(name="A", phone="", subdivision_id=1, address="x"))
      and rejects(lambda: CompleteProfileRequest(name="A", phone="123", subdivision_id=1, address="x")))
check("pet emergency contacts are checked", rejects(lambda: PetCreate(pet_name="P", pet_type="Dog", emergency_contact_phone="123"))
      and rejects(lambda: PetUpdate(emergency_contact_phone="123")))
check("adoption applications need a valid contact number",
      rejects(lambda: AdoptionApplyRequest(holding_id=1, full_name="A", address="x", contact_no="123")))
check("facility contact numbers accept landlines",
      LandmarkCreate(name="Pen", category="Facility", latitude=14.8, longitude=121.0, contact_number="(044) 815-1234").contact_number == "0448151234"
      and rejects(lambda: LandmarkUpdate(contact_number="abc")))
check("a QR finder's contact is checked (public form)", rejects(lambda: QRScanSubmit(finder_contact="call me")))
now = datetime.now()
check("numbers saved before this rule still display (responses aren't re-validated)",
      UserResponse(user_id=1, name="A", email="a@test-mail.com", role_id=1, phone="0977843728", created_at=now, updated_at=now).phone == "0977843728")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
