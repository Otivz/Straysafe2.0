"""
Who may create a resident account without being on the official resident list.

There is no public sign-up. The Subdivision Leader imports the official resident list, which creates the accounts, and each resident claims theirs from an e-mailed link (routes/resident_activation.py). The older
open sign-ups (POST /users/ from the public, and a first Google sign-in that creates an account) are therefore closed by default.
OPEN_SELF_REGISTRATION=true reopens them (a rollback switch, and what the older automated tests use); it is not meant for a
real deployment.
"""
import os

from fastapi import HTTPException, status

CLOSED_MESSAGE = ("Create your account from the StraySafe Register page; your residency is then verified by your Subdivision Leader. "
                  "If your Subdivision Leader already created your account, open the activation link we emailed to you.")


def open_self_registration() -> bool:
    return os.getenv("OPEN_SELF_REGISTRATION", "false").strip().lower() in ("1", "true", "yes")


def refuse_open_registration() -> None:
    if not open_self_registration():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=CLOSED_MESSAGE)
