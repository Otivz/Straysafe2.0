"""Read-only analytics with one explicit, shared filter and measurement contract."""
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional

from fastapi import HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

from app.models.audit_log import AuditLog
from app.models.pet import Pet
from app.models.report import Adoption, HoldingAnimal, Report, ReportCategory, Rescue
from app.models.report_match import ReportMatch
from app.models.user import Subdivision, User
from app.models.warning import OwnerWarning
from app.utils.case_closure import CLOSED_REPORT_STATUS_IDS

MANILA = timezone(timedelta(hours=8))
RESOLVED_STATUS_IDS = {9, 10, 11}


class AnalyticsFilters:
    def __init__(
        self,
        days: Optional[int] = Query(None, ge=1, le=3650),
        start_date: Optional[date] = Query(None),
        end_date: Optional[date] = Query(None),
        group_by: Literal['auto', 'day', 'week', 'month'] = Query('auto'),
        subdivision_id: Optional[int] = Query(None, ge=1),
        animal_type: Optional[Literal['Dog', 'Cat', 'Other']] = Query(None),
        priority: Optional[Literal['Low', 'Medium', 'High']] = Query(None),
        status: Literal['all', 'active', 'closed', 'resolved'] = Query('all'),
        category_id: Optional[int] = Query(None, ge=1),
    ):
        self.days, self.start_date, self.end_date = days, start_date, end_date
        self.group_by, self.subdivision_id = group_by, subdivision_id
        self.animal_type, self.priority, self.status, self.category_id = animal_type, priority, status, category_id


def local_now():
    return datetime.now(MANILA)


def percentage(numerator, denominator):
    return round(100 * numerator / denominator, 1) if denominator else None


def date_window(filters, earliest):
    today = local_now().date()
    if bool(filters.start_date) != bool(filters.end_date):
        raise HTTPException(422, 'Provide both start_date and end_date.')
    if filters.start_date and filters.days:
        raise HTTPException(422, 'Use either days or a custom date range, not both.')
    end = filters.end_date or today
    start = filters.start_date or (end - timedelta(days=filters.days - 1) if filters.days else (min(earliest.date(), end) if earliest else end))
    if start > end:
        raise HTTPException(422, 'Start date must be on or before end date.')
    if end > today:
        raise HTTPException(422, 'End date cannot be in the future.')
    span = (end - start).days + 1
    if filters.start_date and span > 3650:
        raise HTTPException(422, 'Custom date ranges cannot exceed 3,650 days. Use all time for the complete history.')
    grouping = filters.group_by
    if grouping == 'auto':
        grouping = 'day' if span <= 60 else 'week' if span <= 365 else 'month'
    # Avoid thousands of SVG points and unbounded daily/weekly responses.
    if (grouping == 'day' and span > 366) or (grouping == 'week' and span > 366 * 7):
        raise HTTPException(422, 'This range is too long for that interval. Choose automatic or monthly grouping.')
    return datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min), grouping


def bucket(day, grouping):
    if grouping == 'week':
        return day - timedelta(days=day.weekday())
    return day.replace(day=1) if grouping == 'month' else day


def next_bucket(day, grouping):
    if grouping == 'month':
        return (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return day + timedelta(days=7 if grouping == 'week' else 1)


def report_attributes(query, filters, subdivision_id):
    if subdivision_id:
        query = query.filter(Report.subdivision_id == subdivision_id)
    if filters.animal_type == 'Other':
        query = query.filter(or_(Report.animal_type.is_(None), func.lower(Report.animal_type).notin_(['dog', 'cat'])))
    elif filters.animal_type:
        query = query.filter(func.lower(Report.animal_type) == filters.animal_type.lower())
    if filters.priority:
        query = query.filter(Report.priority_level == filters.priority)
    if filters.category_id:
        query = query.filter(Report.category_id == filters.category_id)
    if filters.status == 'active':
        query = query.filter(or_(Report.current_status_id.is_(None), Report.current_status_id.notin_(CLOSED_REPORT_STATUS_IDS)))
    elif filters.status == 'closed':
        query = query.filter(Report.current_status_id.in_(CLOSED_REPORT_STATUS_IDS))
    elif filters.status == 'resolved':
        query = query.filter(Report.current_status_id.in_(RESOLVED_STATUS_IDS))
    return query


def in_window(query, column, start, end):
    return query.filter(column >= start, column < end)


def report_summary(reports):
    resolved = sum(r.current_status_id in RESOLVED_STATUS_IDS for r in reports)
    closed = sum(r.current_status_id in CLOSED_REPORT_STATUS_IDS for r in reports)
    valid = [r for r in reports if r.created_at and r.verified_at and r.verified_at >= r.created_at]
    hours = [(r.verified_at - r.created_at).total_seconds() / 3600 for r in valid]
    return {
        'total_reports': len(reports), 'resolved_reports': resolved,
        'closed_reports': closed, 'active_reports': len(reports) - closed,
        'resolution_rate': percentage(resolved, len(reports)),
        'avg_verification_hours': round(sum(hours) / len(hours), 1) if hours else None,
        'verified_reports': len(valid),
    }


def registry_query(db, filters, subdivision_id):
    owner, registrar = aliased(User), aliased(User)
    pet_scope = func.coalesce(owner.subdivision_id, registrar.subdivision_id)
    query = db.query(Pet, pet_scope.label('subdivision_id')).outerjoin(owner, Pet.owner_id == owner.user_id).outerjoin(registrar, Pet.registered_by_user_id == registrar.user_id).filter(
        or_(Pet.status != 'Archived', Pet.status.is_(None)), Pet.merged_into_pet_id.is_(None),
    )
    if subdivision_id:
        query = query.filter(pet_scope == subdivision_id)
    if filters.animal_type:
        query = query.filter(Pet.pet_type == filters.animal_type)
    return query


def warnings_query(db, filters, subdivision_id, eligible_reports, pets_q):
    query = db.query(OwnerWarning, User.subdivision_id).join(User, OwnerWarning.user_id == User.user_id)
    if subdivision_id:
        query = query.filter(User.subdivision_id == subdivision_id)
    if filters.priority or filters.category_id or filters.status != 'all':
        query = query.filter(OwnerWarning.report_id.in_(eligible_reports))
    if filters.animal_type:
        query = query.filter(or_(OwnerWarning.pet_id.in_(pets_q.with_entities(Pet.pet_id)), OwnerWarning.report_id.in_(eligible_reports)))
    return query


def analytics_payload(db: Session, filters: AnalyticsFilters, subdivision_id: Optional[int], admin: bool):
    categories = db.query(ReportCategory).order_by(ReportCategory.category_name).all()
    cat_names = {c.category_id: c.category_name for c in categories}
    if filters.category_id and filters.category_id not in cat_names:
        raise HTTPException(422, 'Unknown incident category.')
    subdivisions = db.query(Subdivision).order_by(Subdivision.subdivision_name).all()
    subdivision = next((s for s in subdivisions if s.subdivision_id == subdivision_id), None)
    if subdivision_id and not subdivision:
        raise HTTPException(404, 'Subdivision not found.')

    # A group submission is one incident. Animal child records and merged sightings are not extra incidents.
    base = report_attributes(db.query(Report), filters, subdivision_id).filter(
        Report.split_from_report_id.is_(None), Report.duplicate_of_report_id.is_(None),
        or_(Report.current_status_id.is_(None), Report.current_status_id != 18),
    )
    eligible_reports = report_attributes(db.query(Report.report_id), filters, subdivision_id)
    pets_q = registry_query(db, filters, subdivision_id)
    warnings_q = warnings_query(db, filters, subdivision_id, eligible_reports, pets_q)
    holding_q = db.query(HoldingAnimal).filter(HoldingAnimal.report_id.in_(eligible_reports))
    rescue_q = db.query(Rescue).filter(Rescue.report_id.in_(eligible_reports), Rescue.status_id == 6, Rescue.started_at.isnot(None), Rescue.completed_at >= Rescue.started_at)
    adoption_q = db.query(Adoption).join(HoldingAnimal, Adoption.holding_id == HoldingAnimal.holding_id).filter(HoldingAnimal.report_id.in_(eligible_reports))
    matches_q = db.query(ReportMatch).filter(ReportMatch.source_report_id.in_(eligible_reports))
    users = db.query(User.user_id, User.status)
    if subdivision_id:
        users = users.filter(User.subdivision_id == subdivision_id)
    audit_q = db.query(AuditLog)
    if subdivision_id:
        audit_q = audit_q.filter(AuditLog.user_id.in_(users.with_entities(User.user_id)))
    earliest = base.with_entities(func.min(Report.created_at)).scalar()
    if not filters.days and not filters.start_date:
        candidates = [earliest, warnings_q.with_entities(func.min(OwnerWarning.created_at)).scalar(), holding_q.with_entities(func.min(HoldingAnimal.intake_date)).scalar()]
        if admin:
            candidates.extend([rescue_q.with_entities(func.min(Rescue.completed_at)).scalar(), adoption_q.with_entities(func.min(Adoption.created_at)).scalar(), matches_q.with_entities(func.min(ReportMatch.created_at)).scalar(), audit_q.with_entities(func.min(AuditLog.created_at)).scalar()])
        earliest = min((value for value in candidates if value), default=None)
    start, end, grouping = date_window(filters, earliest)
    columns = (Report.report_id, Report.subdivision_id, Report.created_at, Report.verified_at,
               Report.current_status_id, Report.category_id, Report.animal_type, Report.priority_level)
    reports = in_window(base, Report.created_at, start, end).with_entities(*columns).order_by(Report.created_at).all()
    kpis = report_summary(reports)

    compared = bool(filters.days or filters.start_date)
    try:
        previous_start = start - (end - start) if compared else start
    except OverflowError:
        raise HTTPException(422, 'This date range is too early for an equal-period comparison.')
    previous = report_summary(in_window(base, Report.created_at, previous_start, start).with_entities(*columns).all()) if compared else None
    change = None
    if previous and previous['total_reports']:
        change = round((len(reports) - previous['total_reports']) / previous['total_reports'] * 100, 1)

    timeline = {}
    day = bucket(start.date(), grouping)
    while day < end.date():
        key = day.isoformat() if grouping != 'month' else day.strftime('%Y-%m')
        timeline[key] = {'date': key, 'total': 0, 'resolved': 0, 'high_risk': 0, 'aggressive': 0}
        day = next_bucket(day, grouping)
    animals, priorities, category_counts, per_subdivision = Counter(), Counter(), Counter(), defaultdict(list)
    for report in reports:
        day = bucket(report.created_at.date(), grouping)
        key = day.isoformat() if grouping != 'month' else day.strftime('%Y-%m')
        point = timeline[key]
        point['total'] += 1
        point['resolved'] += int(report.current_status_id in RESOLVED_STATUS_IDS)
        name = cat_names.get(report.category_id, 'Uncategorized')
        high_risk = report.priority_level == 'High' or any(word in name.lower() for word in ('aggress', 'rabies', 'rabid'))
        point['high_risk'] += int(high_risk)
        point['aggressive'] += int(high_risk)  # compatible with the original subdivision response
        category_counts[name] += 1
        animal = (report.animal_type or '').strip().capitalize()
        animals[animal if animal in ('Dog', 'Cat') else 'Other'] += 1
        priorities[report.priority_level or 'Unspecified'] += 1
        per_subdivision[report.subdivision_id].append(report)

    # Current registry snapshot, scoped by owner, with registrar fallback for ownerless community animals.
    pets = pets_q.all()
    today = local_now().date()
    vaccinated = sum(bool(p.is_vaccinated) and (p.vaccine_expiry is None or p.vaccine_expiry >= today) for p, _ in pets)
    pet_counts = Counter(scope for _, scope in pets)

    # Related operations retain per-animal child records. Date filters use each operation's own event date.
    warnings = in_window(warnings_q, OwnerWarning.created_at, start, end).all()
    warning_counts = Counter(scope for _, scope in warnings)
    violations = Counter(w.violation_type or 'Other' for w, _ in warnings)

    holding = in_window(holding_q, HoldingAnimal.intake_date, start, end).all()
    holding_summary = {
        'total_intake': len(holding),
        'returned_to_owner': sum(h.facility_status == 3 for h in holding),
        'currently_held': sum(h.facility_status in (1, 2, 6, 8) and h.discharge_date is None for h in holding),
        'transferred_to_shelter': sum(h.facility_status == 5 for h in holding),
    }
    generated = local_now()
    result = {
        'metadata': {
            'start_date': start.date().isoformat(), 'end_date': (end - timedelta(days=1)).date().isoformat(),
            'group_by': grouping, 'timezone': 'Asia/Manila', 'generated_at': generated.isoformat(),
            'all_time': not filters.days and not filters.start_date,
            'subdivision_id': subdivision_id,
            'filters': {'animal_type': filters.animal_type, 'priority': filters.priority, 'status': filters.status, 'category_id': filters.category_id},
        },
        'filter_options': {
            'subdivisions': [{'id': s.subdivision_id, 'name': s.subdivision_name} for s in subdivisions if admin or s.subdivision_id == subdivision_id],
            'categories': [{'id': c.category_id, 'name': c.category_name} for c in categories],
        },
        'comparison': {
            'available': compared, 'previous_total': previous['total_reports'] if previous else None,
            'report_change_percent': change,
            'previous_start_date': previous_start.date().isoformat() if compared else None,
            'previous_end_date': (start - timedelta(days=1)).date().isoformat() if compared else None,
        },
        'kpis': {**kpis, 'total_pets': len(pets), 'vaccinated_pets': vaccinated, 'vaccination_rate': percentage(vaccinated, len(pets)), 'total_warnings': len(warnings)},
        'incident_timeline': list(timeline.values()),
        'category_breakdown': [{'category': name, 'count': count, 'percentage': percentage(count, len(reports))} for name, count in category_counts.most_common()],
        'animal_distribution': {name: animals[name] for name in ('Dog', 'Cat', 'Other')},
        'priority_distribution': {name: priorities[name] for name in ('Low', 'Medium', 'High', 'Unspecified')},
        'pet_compliance': {'total_pets': len(pets), 'vaccinated': vaccinated, 'unvaccinated': len(pets) - vaccinated, 'compliance_rate': percentage(vaccinated, len(pets)), 'bite_history_count': sum(bool(p.has_bite_history) for p, _ in pets)},
        'warnings_breakdown': [{'violation': name, 'count': count} for name, count in violations.most_common()],
        'holding_summary': holding_summary,
    }
    if not admin:
        result['subdivision'] = {'id': subdivision_id, 'name': subdivision.subdivision_name, 'barangay_name': subdivision.barangay.barangay_name if subdivision.barangay else ''}
        return result

    rescues = in_window(rescue_q, Rescue.completed_at, start, end).all()
    durations = [(r.completed_at - r.started_at).total_seconds() / 3600 for r in rescues]
    adoptions = in_window(adoption_q, Adoption.created_at, start, end).all()
    approved = sum(a.status == 'Approved' for a in adoptions)
    handed_over = sum(a.status == 'Approved' and a.staff_handed_over and a.is_handed_over for a in adoptions)
    matches = in_window(matches_q, ReportMatch.created_at, start, end).with_entities(ReportMatch.status, ReportMatch.similarity_score).all()
    confirmed = [m for m in matches if m.status == 'CONFIRMED_MATCH']
    reviewed = [m for m in matches if m.status in ('CONFIRMED_MATCH', 'NOT_A_MATCH')]
    user_rows = users.all()
    result.update({
        'subdivisions_comparison': sorted([
            {'subdivision_id': s.subdivision_id, 'subdivision_name': s.subdivision_name,
             **report_summary(per_subdivision[s.subdivision_id]), 'registered_pets': pet_counts[s.subdivision_id], 'warnings_count': warning_counts[s.subdivision_id]}
            for s in subdivisions if not subdivision_id or s.subdivision_id == subdivision_id
        ], key=lambda row: (-row['total_reports'], row['subdivision_name'])),
        'sla_metrics': {'avg_verification_hours': kpis['avg_verification_hours'], 'avg_rescue_hours': round(sum(durations) / len(durations), 1) if durations else None, 'total_verified_cases': kpis['verified_reports'], 'total_completed_rescues': len(rescues)},
        'holding_and_adoption': {**holding_summary, 'total_adoptions': len(adoptions), 'approved_adoptions': approved, 'completed_handovers': handed_over, 'pending_adoptions': sum(a.status == 'Pending' for a in adoptions), 'adoption_rate': percentage(approved, len(adoptions))},
        'ai_performance': {'total_matches_suggested': len(matches), 'confirmed_matches': len(confirmed), 'reviewed_matches': len(reviewed), 'review_acceptance_rate': percentage(len(confirmed), len(reviewed)), 'average_confidence_score': round(sum(m.similarity_score for m in confirmed) / len(confirmed), 1) if confirmed else None},
        'security_overview': {'total_users': len(user_rows), 'active_users': sum(u.status == 'Active' for u in user_rows), 'suspended_users': sum(u.status in ('Inactive', 'Suspended') for u in user_rows), 'audit_events_count': in_window(audit_q, AuditLog.created_at, start, end).count()},
    })
    result['kpis'].update(total_rescues=len(rescues), total_adoptions=approved, total_intake=len(holding), total_users=len(user_rows))
    return result
