from typing import List

from fastapi import HTTPException, status

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128


def password_problems(password: str) -> List[str]:
    """Plain-English list of what the password is missing (empty when it's acceptable)."""
    problems: List[str] = []
    if len(password) < PASSWORD_MIN_LENGTH:
        problems.append(f"at least {PASSWORD_MIN_LENGTH} characters")
    if len(password) > PASSWORD_MAX_LENGTH:
        problems.append(f"no more than {PASSWORD_MAX_LENGTH} characters")
    if not any(c.isupper() for c in password):
        problems.append("an uppercase letter")
    if not any(c.islower() for c in password):
        problems.append("a lowercase letter")
    if not any(c.isdigit() for c in password):
        problems.append("a number")
    if not any(not c.isalnum() and not c.isspace() for c in password):
        problems.append("a special character (such as ! @ # $ %)")
    return problems


def enforce_password_policy(password: str) -> None:
    problems = password_problems(password)
    if problems:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your password needs " + ", ".join(problems[:-1]) + (" and " if len(problems) > 1 else "") + problems[-1] + ".",
        )
