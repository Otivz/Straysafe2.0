"""Create the first accounts of a development database, only when you ask for them. Run it from backend/, in a terminal:

    python scripts/seed_admin.py --leader      a Subdivision Leader
    python scripts/seed_admin.py --admin       an Admin (a role reserved for a future implementation)

It asks for the account's e-mail address and for a password (typed twice, never shown). Nothing is read from .env or from the
environment, and nothing is stored except the password's bcrypt hash in the database: there is no default account, e-mail address
or password anywhere, and with no option nothing is created. A password must meet the application's own policy (at least 12
characters with an upper-case letter, a lower-case letter, a number and a special character; at most 72 bytes).

What it does not do: it does not seed reference data (load Database3.4_subdivision.sql for the roles, the barangay, the subdivision
and the rest) and it never creates or changes a table. An account whose e-mail address already exists is left exactly as it is: no
password is reset and no role is changed. Passwords and hashes are never printed. Residents register in the application, and the
Barangay Staff role is retired, so neither is created here.
"""
import argparse
import getpass
import sys
import os
from datetime import datetime

# Add the backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pydantic import EmailStr, TypeAdapter
from sqlalchemy import func

from app.database import SessionLocal
from app.models.user import Position, Role, Subdivision, User
from app.utils.auth import get_password_hash
from app.utils.password_policy import password_problems

MAX_PASSWORD_BYTES = 72   # bcrypt only looks at the first 72 bytes
ATTEMPTS = 3
ACCOUNTS = {
    "leader": {"label": "Subdivision Leader", "role_id": 2, "name": "Subdivision Leader"},
    "admin": {"label": "Admin", "role_id": 4, "name": "System Admin"},
}


class SeedError(Exception):
    """A reason to stop. Raised before anything is written."""


def password_problem(password):
    """Why this password cannot be used, or None. Never repeats the password."""
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return f"is longer than {MAX_PASSWORD_BYTES} bytes, which bcrypt cannot use."
    missing = password_problems(password)
    return ("needs " + ", ".join(missing) + ".") if missing else None


def clean_email(raw):
    value = raw.strip()
    if not value or len(value) > 100:
        raise ValueError("An e-mail address of at most 100 characters is required.")
    try:
        return str(TypeAdapter(EmailStr).validate_python(value)).lower()
    except Exception:
        raise ValueError("That is not a valid e-mail address.") from None


def ask_email(label, ask, say, taken):
    for _ in range(ATTEMPTS):
        try:
            email = clean_email(ask(f"E-mail address of the {label}: "))
        except ValueError as exc:
            say(f"  {exc}")
            continue
        if email in taken:
            say("  The Leader and the Admin must not use the same e-mail address.")
            continue
        return email
    raise SeedError(f"{label}: no valid e-mail address after {ATTEMPTS} attempts.")


def ask_password(label, ask_secret, say):
    say("Password rules: at least 12 characters (at most 72 bytes) with an upper-case letter, a lower-case letter, a number and a special character.")
    for _ in range(ATTEMPTS):
        first = ask_secret(f"Password of the {label} (hidden): ")
        second = ask_secret("Type it again to confirm (hidden): ")
        if first != second:
            say("  The two entries do not match.")
            continue
        problem = password_problem(first)
        if problem:
            say(f"  The password {problem}")
            continue
        return first
    raise SeedError(f"{label}: no usable password after {ATTEMPTS} attempts.")


def seed(kinds, subdivision_id=None, ask=input, ask_secret=getpass.getpass, say=print):
    db = SessionLocal()
    entered = []                                                    # passwords, only so that an error message can be scrubbed of them
    try:
        for kind in kinds:                                          # the database is checked before anything is asked
            if db.get(Role, ACCOUNTS[kind]["role_id"]) is None:
                raise SeedError("The reference data is missing (the roles). Load Database3.4_subdivision.sql first: this script only creates accounts.")
        if "leader" in kinds:
            ids = [row.subdivision_id for row in db.query(Subdivision).order_by(Subdivision.subdivision_id)]
            if subdivision_id is None and len(ids) == 1:
                subdivision_id = ids[0]
            if subdivision_id not in ids:
                raise SeedError("The Leader needs a subdivision: " + ("the database has none (load Database3.4_subdivision.sql)."
                                if not ids else f"there are {len(ids)}, pass --subdivision with one of {ids}."))
        pending = []
        for kind in kinds:
            spec = ACCOUNTS[kind]
            email = ask_email(spec["label"], ask, say, {e for _, e, _ in pending})
            if db.query(User).filter(func.lower(User.email) == email).first():
                say(f"{spec['label']}: an account with that e-mail address already exists; left exactly as it is.")
                continue
            password = ask_password(spec["label"], ask_secret, say)
            entered.append(password)
            pending.append((kind, email, password))
        for kind, email, password in pending:
            spec = ACCOUNTS[kind]
            position = db.query(Position).filter(Position.position_name == "President").first() if kind == "leader" else None
            user = User(
                name=spec["name"],
                email=email,
                password=get_password_hash(password),
                role_id=spec["role_id"],
                subdivision_id=subdivision_id if kind == "leader" else None,
                position_id=position.position_id if position else None,
                status="Active",
                is_verified=True,
                password_changed_at=datetime.now(),
            )
            db.add(user)
            db.flush()
            say(f"{spec['label']}: created {email} (user id {user.user_id}). The password was not printed; only its bcrypt hash is stored.")
        db.commit()
    except SeedError:
        db.rollback()
        raise
    except Exception as exc:                                         # a database error: never show parameters, hashes or passwords
        db.rollback()
        detail = " ".join(str(getattr(exc, "orig", None) or exc).split())[:300]
        for password in entered:
            detail = detail.replace(password, "***")
        raise SeedError(f"Database error ({type(exc).__name__}): {detail}") from None
    finally:
        db.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Create the first Subdivision Leader and/or Admin of a development database. It asks for the e-mail address and password.")
    parser.add_argument("--leader", action="store_true", help="create a Subdivision Leader")
    parser.add_argument("--admin", action="store_true", help="create an Admin (a reserved role)")
    parser.add_argument("--subdivision", type=int, help="subdivision id for the Leader (needed only when the database has more than one)")
    args = parser.parse_args(argv)
    kinds = [kind for kind in ("leader", "admin") if getattr(args, kind)]
    if not kinds:
        print("No account was requested, so nothing was created. Use --leader and/or --admin (see the top of this file).")
        return 0
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        print("Nothing was created. Run this in a terminal: it asks for the e-mail address and the password, and never reads them from a file, an argument or a pipe.")
        return 2
    try:
        seed(kinds, args.subdivision)
    except SeedError as why:
        print(f"Nothing was created. {why}")
        return 1
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled. Nothing was created.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
