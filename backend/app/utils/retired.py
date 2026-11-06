"""
Subdivision-only gate (docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md, Phase 1).

StraySafe serves the subdivision only. The Barangay is an external party: it has no account here, and its
rescue, holding, claiming and adoption workflows happen outside StraySafe. Their records are kept read-only.

One switch, read here and nowhere else. It is OFF by default in code (no .env change needed).
Set the environment variable BARANGAY_WORKFLOWS_ENABLED=1 only to run the legacy two-client system
(for example the tests written for it).
"""
import os

from fastapi import HTTPException, Request, status

BARANGAY_ROLE_ID = 3

BARANGAY_ACCOUNT_DISABLED_MESSAGE = (
    "Barangay accounts are no longer used in StraySafe. The Barangay is contacted outside the system; "
    "your Subdivision Leader records its updates."
)
RETIRED_WORKFLOW_MESSAGE = (
    "This step is handled by the Barangay outside StraySafe. Existing records are kept read-only."
)

# Write endpoints in retired routers that kept features still use (route path templates as FastAPI registers them).
# - POST /rescue-requests/: the Subdivision Leader's "Escalate to Barangay" until Phase 3 replaces it with the referral log.
# - POST /claims/ and PATCH /claims/{claim_id}/status: the owner-return step in PetMatchReview and
#   CompleteHandoverModal (open decision in the plan, section 11).
KEPT_WRITE_ROUTES = {
    ("POST", "/rescue-requests/"),
    ("POST", "/claims/"),
    ("PATCH", "/claims/{claim_id}/status"),
}

READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def barangay_workflows_enabled() -> bool:
    return os.getenv("BARANGAY_WORKFLOWS_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def barangay_account_blocked(user) -> bool:
    """True when this user is a Barangay account and the Barangay no longer signs in."""
    return (
        user is not None
        and getattr(user, "role_id", None) == BARANGAY_ROLE_ID
        and not barangay_workflows_enabled()
    )


def refuse_barangay_account(user) -> None:
    if barangay_account_blocked(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=BARANGAY_ACCOUNT_DISABLED_MESSAGE)


def retired_workflow(request: Request) -> None:
    """
    Router-level dependency for the retired Barangay workflows (rescue dispatch, holding, claims,
    claim fees, adoption). Reads stay available as history; writes are refused for every role,
    except the routes in KEPT_WRITE_ROUTES.
    """
    if barangay_workflows_enabled() or request.method in READ_METHODS:
        return
    route = request.scope.get("route")
    path = getattr(route, "path", None) or request.url.path
    if (request.method, path) in KEPT_WRITE_ROUTES:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=RETIRED_WORKFLOW_MESSAGE)
