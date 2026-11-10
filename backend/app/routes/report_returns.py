"""Owner lookup + read access for the 'Returned to Owner / Reunited' records."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.report import Report, ReportReturn
from app.models.user import User
from app.utils.auth import get_current_staff_or_admin, get_current_user, verify_subdivision_scope
from app.utils.owner_returns import search_owner_accounts, serialize_return

router = APIRouter(prefix="/report-returns", tags=["report-returns"])


@router.get("/owner-search")
def owner_search(
    q: str = Query(..., min_length=2, max_length=60),
    current_user: User = Depends(get_current_staff_or_admin),
    db: Session = Depends(get_db),
):
    """Minimal resident lookup (name / email / phone) scoped to the caller's subdivision or barangay."""
    return [
        {
            "user_id": u.user_id,
            "name": u.name,
            "phone": u.phone,
            "email": u.email,
            "address": u.address,
            "profile_picture": u.profile_picture,
        }
        for u in search_owner_accounts(q, current_user, db)
    ]


@router.get("/by-report/{report_id}")
def get_return_for_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    from app.utils.case_groups import case_root, case_members
    root = case_root(db, report)
    members = case_members(db, root)
    member_ids = [m.report_id for m in members]

    rec = (
        db.query(ReportReturn)
        .options(joinedload(ReportReturn.returner))
        .filter(ReportReturn.report_id.in_(member_ids))
        .order_by(ReportReturn.returned_at.desc(), ReportReturn.return_id.desc())
        .first()
    )
    if current_user.role_id == 1:
        user_is_reporter = report.user_id == current_user.user_id or any(m.user_id == current_user.user_id for m in members)
        if not user_is_reporter and not (rec and rec.owner_user_id == current_user.user_id):
            raise HTTPException(status_code=403, detail="Access denied")
        if rec is None:
            return None
        data = serialize_return(rec, db=db)
        # Residents only see the outcome, not the other party's contact details
        if rec.owner_user_id != current_user.user_id:
            for k in ("owner_phone", "owner_email", "owner_address", "id_presented", "id_type", "id_last4", "notes", "ownership_proof_urls"):
                data[k] = None
        return data

    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    if rec is not None:
        return serialize_return(rec, db=db)

    return None
