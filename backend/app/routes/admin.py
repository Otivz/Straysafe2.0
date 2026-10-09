from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.database import get_db
from app.models.user import User, Subdivision
from app.models.report import Report, HoldingAnimal, Adoption, Rescue
from app.models.pet import Pet, PetVaccination
from app.models.warning import OwnerWarning
from app.models.audit_log import AuditLog
from app.models.report_match import ReportMatch
from app.utils.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])

CLOSED_STATUS_IDS = [3, 6, 9, 10, 11, 12, 14, 17, 18]
RESOLVED_STATUS_IDS = [6, 10, 11]

@router.get("/dashboard-stats")
def get_admin_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Admin role required for administrative dashboard statistics."
        )

    # 1. Reports Metrics
    total_reports = db.query(func.count(Report.report_id)).scalar() or 0
    resolved_reports = db.query(func.count(Report.report_id)).filter(
        Report.current_status_id.in_(RESOLVED_STATUS_IDS)
    ).scalar() or 0
    active_reports = db.query(func.count(Report.report_id)).filter(
        Report.current_status_id.notin_(CLOSED_STATUS_IDS)
    ).scalar() or 0
    resolution_rate = round((resolved_reports / total_reports) * 100) if total_reports > 0 else 100

    validated_reports_count = db.query(func.count(Report.report_id)).filter(
        Report.current_status_id >= 2,
        Report.current_status_id != 3
    ).scalar() or 0

    # Real Biometric Match Confidence (TASK ADMIN-013)
    # Average similarity score of confirmed / verified sighting matches
    verified_matches_stats = db.query(
        func.count(ReportMatch.match_id).label("count"),
        func.avg(ReportMatch.similarity_score).label("avg_score")
    ).filter(
        ReportMatch.status.in_(["CONFIRMED_MATCH", "VERIFIED"])
    ).first()

    verified_matches_count = verified_matches_stats.count if verified_matches_stats and verified_matches_stats.count else 0
    raw_avg_confidence = verified_matches_stats.avg_score if verified_matches_stats and verified_matches_stats.avg_score is not None else None
    biometric_match_confidence = round(float(raw_avg_confidence)) if raw_avg_confidence is not None else None
    # Kept for API compatibility only: this is the average AI score of staff-confirmed matches, NOT a measured accuracy
    # (see AI_ACCURACY_VALIDATION_IMPLEMENTATION.md). Don't show it as "accuracy".
    ai_accuracy = biometric_match_confidence

    endorsed_count = db.query(func.count(Report.report_id)).filter(
        Report.current_status_id.in_([4, 5, 6, 7, 8, 9, 10, 11, 13])
    ).scalar() or 0
    in_progress_count = db.query(func.count(Report.report_id)).filter(
        Report.current_status_id.in_([4, 5, 7, 8, 13])
    ).scalar() or 0

    dog_reports_count = db.query(func.count(Report.report_id)).filter(
        func.lower(Report.animal_type).like('%dog%')
    ).scalar() or 0
    cat_reports_count = db.query(func.count(Report.report_id)).filter(
        func.lower(Report.animal_type).like('%cat%')
    ).scalar() or 0
    high_risk_reports_count = db.query(func.count(Report.report_id)).filter(
        or_(
            Report.priority_level.in_(['High', 'Critical']),
            Report.category_id.in_([2, 3])
        )
    ).scalar() or 0
    pet_id_reports_count = db.query(func.count(Report.report_id)).filter(
        or_(
            Report.pet_id.isnot(None),
            Report.is_possible_owned == True
        )
    ).scalar() or 0

    dog_percentage = round((dog_reports_count / total_reports) * 100) if total_reports > 0 else 0
    cat_percentage = round((cat_reports_count / total_reports) * 100) if total_reports > 0 else 0
    high_risk_percentage = round((high_risk_reports_count / total_reports) * 100) if total_reports > 0 else 0
    pet_id_percentage = round((pet_id_reports_count / total_reports) * 100) if total_reports > 0 else 0

    # 2. Pets Metrics
    total_pets = db.query(func.count(Pet.pet_id)).scalar() or 0
    vaccinated_pets = db.query(func.count(func.distinct(PetVaccination.pet_id))).scalar() or 0
    compliance_rate = round((vaccinated_pets / total_pets) * 100) if total_pets > 0 else 100

    # 3. Users Metrics
    total_users = db.query(func.count(User.user_id)).scalar() or 0
    active_users = db.query(func.count(User.user_id)).filter(User.status == 'Active').scalar() or 0
    suspended_users = db.query(func.count(User.user_id)).filter(
        User.status.in_(['Inactive', 'Suspended', 'Deactivated'])
    ).scalar() or 0

    # 4. Holding & Adoptions Metrics
    holding_count = db.query(func.count(HoldingAnimal.holding_id)).scalar() or 0
    returned_to_owner_count = db.query(func.count(HoldingAnimal.holding_id)).filter(
        HoldingAnimal.facility_status == 3
    ).scalar() or 0
    active_adoptions_count = db.query(func.count(Adoption.adoption_id)).filter(
        Adoption.status == 'Pending'
    ).scalar() or 0
    for_adoption_count = db.query(func.count(HoldingAnimal.holding_id)).filter(
        HoldingAnimal.facility_status == 6
    ).scalar() or 0
    approved_adoptions_count = db.query(func.count(Adoption.adoption_id)).filter(
        Adoption.status == 'Approved'
    ).scalar() or 0

    # 5. Warnings & Rescue
    pending_warnings_count = db.query(func.count(OwnerWarning.warning_id)).filter(
        OwnerWarning.status == 'Pending'
    ).scalar() or 0
    rescue_success_count = db.query(func.count(Rescue.rescue_id)).filter(
        Rescue.status_id.in_([5, 6])
    ).scalar() or 0
    rescued_count = rescue_success_count + holding_count

    # 6. Audit & Security Overview
    total_audit_logs = db.query(func.count(AuditLog.log_id)).scalar() or 0
    failed_logins_count = db.query(func.count(AuditLog.log_id)).filter(
        or_(
            AuditLog.log_type == 'security',
            func.lower(AuditLog.action).like('%fail%'),
            func.lower(AuditLog.description).like('%fail%')
        )
    ).scalar() or 0

    recent_logs_query = (
        db.query(AuditLog, User.name)
        .outerjoin(User, AuditLog.user_id == User.user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(4)
        .all()
    )

    recent_activity_logs = [
        {
            "id": log.log_id,
            "user": user_name or "System User",
            "action": log.action,
            "description": log.description or "Audit action recorded",
            "timestamp": log.created_at.strftime("%b %d, %I:%M %p") if log.created_at else "Recent",
            "type": log.log_type or "operation"
        }
        for log, user_name in recent_logs_query
    ]

    # 7. Subdivisions Aggregation Breakdown
    subdivisions = db.query(Subdivision).all()
    subdivisions_list = []
    for subd in subdivisions:
        subd_total = db.query(func.count(Report.report_id)).filter(
            Report.subdivision_id == subd.subdivision_id
        ).scalar() or 0
        subd_resolved = db.query(func.count(Report.report_id)).filter(
            Report.subdivision_id == subd.subdivision_id,
            Report.current_status_id.in_(RESOLVED_STATUS_IDS)
        ).scalar() or 0
        subd_pending = max(0, subd_total - subd_resolved)
        subd_rate = round((subd_resolved / subd_total) * 100) if subd_total > 0 else 100
        subdivisions_list.append({
            "name": subd.subdivision_name,
            "reports": subd_total,
            "resolved": subd_resolved,
            "pending": subd_pending,
            "rate": subd_rate
        })

    if not subdivisions_list:
        subdivisions_list = [
            {
                "name": "San Vicente Proper",
                "reports": total_reports or 1,
                "resolved": resolved_reports,
                "pending": max(0, total_reports - resolved_reports),
                "rate": resolution_rate
            }
        ]

    # 8. Lightweight Active Map Incidents (Coordinates & pin info only)
    active_incidents = (
        db.query(
            Report.report_id,
            Report.latitude,
            Report.longitude,
            Report.description,
            Report.priority_level,
            Report.animal_type,
            Report.current_status_id,
            Report.created_at
        )
        .filter(
            Report.latitude.isnot(None),
            Report.longitude.isnot(None),
            Report.current_status_id.notin_(CLOSED_STATUS_IDS)
        )
        .order_by(Report.report_id.desc())
        .limit(100)
        .all()
    )

    active_map_reports = [
        {
            "report_id": inc.report_id,
            "latitude": str(inc.latitude),
            "longitude": str(inc.longitude),
            "description": inc.description or f"Incident #{inc.report_id}",
            "priority_level": inc.priority_level or "Medium",
            "animal_type": inc.animal_type or "Stray Animal",
            "status_id": inc.current_status_id,
            "created_at": inc.created_at.isoformat() if inc.created_at else None
        }
        for inc in active_incidents
    ]

    return {
        "total_reports": total_reports,
        "active_reports": active_reports,
        "resolved_reports": resolved_reports,
        "resolution_rate": resolution_rate,
        "validated_reports_count": validated_reports_count,
        "biometric_match_confidence": biometric_match_confidence,
        "verified_matches_count": verified_matches_count,
        "ai_accuracy": ai_accuracy,
        "endorsed_count": endorsed_count,
        "in_progress_count": in_progress_count,
        "dog_reports_count": dog_reports_count,
        "cat_reports_count": cat_reports_count,
        "high_risk_reports_count": high_risk_reports_count,
        "pet_id_reports_count": pet_id_reports_count,
        "dog_percentage": dog_percentage,
        "cat_percentage": cat_percentage,
        "high_risk_percentage": high_risk_percentage,
        "pet_id_percentage": pet_id_percentage,
        "total_pets": total_pets,
        "vaccinated_pets": vaccinated_pets,
        "compliance_rate": compliance_rate,
        "total_users": total_users,
        "active_users": active_users,
        "suspended_users": suspended_users,
        "holding_count": holding_count,
        "returned_to_owner_count": returned_to_owner_count,
        "active_adoptions_count": active_adoptions_count,
        "for_adoption_count": for_adoption_count,
        "approved_adoptions_count": approved_adoptions_count,
        "pending_warnings_count": pending_warnings_count,
        "rescued_count": rescued_count,
        "total_audit_logs": total_audit_logs,
        "failed_logins_count": failed_logins_count,
        "subdivisions_list": subdivisions_list,
        "recent_activity_logs": recent_activity_logs,
        "active_map_reports": active_map_reports
    }

@router.get("/badge-counts")
def get_admin_badge_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Lightweight endpoint for sidebar badges (TASK ADMIN-005)"""
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Admin role required for badge counts."
        )

    active_report_records = db.query(Report.report_id).filter(
        Report.current_status_id.notin_(CLOSED_STATUS_IDS)
    ).all()
    active_report_ids = [r[0] for r in active_report_records]

    pending_adoptions = db.query(func.count(Adoption.adoption_id)).filter(
        Adoption.status == 'Pending'
    ).scalar() or 0

    pending_warnings = db.query(func.count(OwnerWarning.warning_id)).filter(
        OwnerWarning.status == 'Pending'
    ).scalar() or 0

    return {
        "active_reports": len(active_report_ids),
        "active_report_ids": active_report_ids,
        "pending_adoptions": pending_adoptions,
        "pending_warnings": pending_warnings
    }

