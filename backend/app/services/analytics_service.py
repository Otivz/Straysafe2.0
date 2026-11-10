"""Read-only analytics with one explicit, shared filter and measurement contract."""
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional

from fastapi import HTTPException, Query
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session, aliased

from app.models.audit_log import AuditLog
from app.models.barangay_referral import BarangayReferral, OUTCOME_STATUS
from app.models.pet import Pet
from app.models.owner_followup import OwnerFollowUp
from app.models.report import Report, ReportCategory
from app.models.report_match import ReportMatch
from app.models.user import Subdivision, User
from app.models.warning import OwnerWarning
from app.utils.case_closure import CLOSED_REPORT_STATUS_IDS

MANILA = timezone(timedelta(hours=8))
RESOLVED_STATUS_IDS = {9, 10, 11}
# One status group per report (docs/01-system/ANALYTICS_RULES.md). Every current status belongs to exactly one group,
# so the groups always add up to the incident total. A report with no status yet is Pending.
STATUS_GROUPS = (
    ('pending', 'Pending', (1,)),
    ('under_review', 'Under review', (15, 16)),
    ('verified', 'Verified', (2,)),
    ('endorsed', 'Referred to Barangay', (4, 13)),
    ('in_progress', 'Owner observation / other in-progress', (5, 6, 7, 8)),
    ('resolved', 'Resolved', (9, 10, 11)),
    ('rejected', 'Rejected / dismissed', (3, 14)),
    ('closed_other', 'Closed (deceased / not found)', (12, 17)),
)
STATUS_GROUP_OF = {sid: key for key, _, ids in STATUS_GROUPS for sid in ids}
STATUS_FILTERS = ('all', 'active', 'closed') + tuple(key for key, _, _ in STATUS_GROUPS)

def status_group(status_id):
    return STATUS_GROUP_OF.get(status_id, 'pending' if status_id is None else 'closed_other' if status_id in CLOSED_REPORT_STATUS_IDS else 'in_progress')


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
        status: Literal['all', 'active', 'closed', 'pending', 'under_review', 'verified', 'endorsed', 'in_progress',
                        'resolved', 'rejected', 'closed_other'] = Query('all'),
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
    elif filters.status in STATUS_GROUP_OF.values():
        ids = next(ids for key, _, ids in STATUS_GROUPS if key == filters.status)
        cond = Report.current_status_id.in_(ids)
        query = query.filter(or_(cond, Report.current_status_id.is_(None)) if filters.status == 'pending' else cond)
    return query


def in_window(query, column, start, end):
    return query.filter(column >= start, column < end)


def report_summary(reports):
    resolved = sum(r.current_status_id in RESOLVED_STATUS_IDS for r in reports)
    closed = sum(r.current_status_id in CLOSED_REPORT_STATUS_IDS for r in reports)
    valid = [r for r in reports if r.created_at and r.verified_at and r.verified_at >= r.created_at]
    hours = [(r.verified_at - r.created_at).total_seconds() / 3600 for r in valid]
    groups = Counter(status_group(r.current_status_id) for r in reports)
    return {
        'total_reports': len(reports), 'resolved_reports': resolved,
        'closed_reports': closed, 'active_reports': len(reports) - closed,
        'pending_reports': groups['pending'], 'under_review_reports': groups['under_review'],
        'verified_status_reports': groups['verified'], 'endorsed_reports': groups['endorsed'],
        'in_progress_reports': groups['in_progress'], 'rejected_reports': groups['rejected'],
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
    """admin: system-wide (optionally one subdivision). Otherwise one subdivision."""
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
    # Referrals are records of external work, separate from the report status.
    referral_q = db.query(BarangayReferral).filter(BarangayReferral.report_id.in_(eligible_reports))
    matches_q = db.query(ReportMatch).filter(ReportMatch.source_report_id.in_(eligible_reports))
    users = db.query(User.user_id, User.status)
    if subdivision_id:
        users = users.filter(User.subdivision_id == subdivision_id)
    audit_q = db.query(AuditLog)
    if subdivision_id:
        audit_q = audit_q.filter(AuditLog.user_id.in_(users.with_entities(User.user_id)))
    earliest = base.with_entities(func.min(Report.created_at)).scalar()
    if not filters.days and not filters.start_date:
        candidates = [earliest, warnings_q.with_entities(func.min(OwnerWarning.created_at)).scalar(), referral_q.with_entities(func.min(BarangayReferral.referred_at)).scalar()]
        if admin:
            candidates.extend([matches_q.with_entities(func.min(ReportMatch.created_at)).scalar(), audit_q.with_entities(func.min(AuditLog.created_at)).scalar()])
        earliest = min((value for value in candidates if value), default=None)
    start, end, grouping = date_window(filters, earliest)
    columns = (Report.report_id, Report.subdivision_id, Report.created_at, Report.verified_at,
               Report.current_status_id, Report.category_id, Report.animal_type, Report.priority_level, Report.landmark)
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
    locations, location_label = Counter(), {}
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
        place = ' '.join((report.landmark or '').split())
        if place:
            locations[place.lower()] += 1
            location_label.setdefault(place.lower(), place)

    # Current registry snapshot, scoped by owner, with registrar fallback for ownerless community animals.
    # Aggregated in the database (no pet rows loaded): totals, current vaccination, bite history, per-area counts
    today = local_now().date()
    current_vax = and_(Pet.is_vaccinated.is_(True), or_(Pet.vaccine_expiry.is_(None), Pet.vaccine_expiry >= today))
    scope_col = pets_q.column_descriptions[1]['expr']
    pet_rows = pets_q.with_entities(scope_col, func.count(Pet.pet_id), func.sum(case((current_vax, 1), else_=0)),
                                    func.sum(case((Pet.has_bite_history.is_(True), 1), else_=0))).group_by(scope_col).all()
    pet_counts = Counter({scope: int(n or 0) for scope, n, _, _ in pet_rows})
    total_pets = sum(pet_counts.values())
    vaccinated = sum(int(v or 0) for _, _, v, _ in pet_rows)
    bite_history = sum(int(b or 0) for _, _, _, b in pet_rows)

    # Related operations retain per-animal child records. Date filters use each operation's own event date.
    warnings = in_window(warnings_q, OwnerWarning.created_at, start, end).all()
    warning_counts = Counter(scope for _, scope in warnings)
    violations = Counter(w.violation_type or 'Other' for w, _ in warnings)

    kpis_groups = Counter(status_group(r.current_status_id) for r in reports)
    # Observations (owner follow-ups) on the cases in scope: open now, and concluded in the period
    obs_q = db.query(OwnerFollowUp.status, OwnerFollowUp.closed_at).filter(OwnerFollowUp.report_id.in_(eligible_reports))
    obs_rows = obs_q.all()
    observations = {
        'active_now': sum(o.status == 'observing' for o in obs_rows),
        'resolved_in_period': sum(o.status == 'complied' and o.closed_at is not None and start <= o.closed_at < end for o in obs_rows),
        'other_endings_in_period': sum(o.status in ('closed', 'escalated', 'cancelled') and o.closed_at is not None and start <= o.closed_at < end for o in obs_rows),
    }
    generated = local_now()
    # Date filter = referral date, including referrals of older reports. Open/closed is the log's current outcome.
    referrals = in_window(referral_q, BarangayReferral.referred_at, start, end).with_entities(BarangayReferral.final_outcome).all()
    referral_outcomes = Counter(row.final_outcome for row in referrals)
    referral_summary = {
        'referred': len(referrals),
        'open': referral_outcomes[None],
        'closed': len(referrals) - referral_outcomes[None],
        'outcomes': {outcome: referral_outcomes[outcome] for outcome in OUTCOME_STATUS},
    }
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
        'kpis': {**kpis, 'total_pets': total_pets, 'vaccinated_pets': vaccinated, 'vaccination_rate': percentage(vaccinated, total_pets), 'total_warnings': len(warnings)},
        'status_distribution': [{'key': key, 'label': label, 'count': kpis_groups.get(key, 0)} for key, label, _ in STATUS_GROUPS],
        'top_locations': [{'location': location_label[k], 'count': n} for k, n in sorted(locations.items(), key=lambda kv: (-kv[1], kv[0]))[:8]],
        'incident_timeline': list(timeline.values()),
        'category_breakdown': [{'category': name, 'count': count, 'percentage': percentage(count, len(reports))} for name, count in category_counts.most_common()],
        'animal_distribution': {name: animals[name] for name in ('Dog', 'Cat', 'Other')},
        'priority_distribution': {name: priorities[name] for name in ('Low', 'Medium', 'High', 'Unspecified')},
        'pet_compliance': {'total_pets': total_pets, 'vaccinated': vaccinated, 'unvaccinated': total_pets - vaccinated, 'compliance_rate': percentage(vaccinated, total_pets), 'bite_history_count': bite_history},
        'warnings_breakdown': [{'violation': name, 'count': count} for name, count in violations.most_common()],
        'observations': observations,
        'referral_summary': referral_summary,
    }
    # The case workflow numbers for the Admin Analytics page (additive; same filters and window as everything above)
    result['case_lifecycle'] = case_lifecycle_summary(db, base, eligible_reports, cat_names, start, end, grouping, referral_q)
    if not admin:
        result['subdivision'] = {'id': subdivision_id, 'name': subdivision.subdivision_name, 'barangay_name': subdivision.barangay.barangay_name if subdivision.barangay else ''}
        return result

    sla = {'avg_verification_hours': kpis['avg_verification_hours'], 'total_verified_cases': kpis['verified_reports']}
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
        'sla_metrics': sla,
        'ai_performance': {'total_matches_suggested': len(matches), 'confirmed_matches': len(confirmed), 'reviewed_matches': len(reviewed), 'review_acceptance_rate': percentage(len(confirmed), len(reviewed)), 'average_confidence_score': round(sum(m.similarity_score for m in confirmed) / len(confirmed), 1) if confirmed else None},
        'security_overview': {'total_users': len(user_rows), 'active_users': sum(u.status == 'Active' for u in user_rows), 'suspended_users': sum(u.status in ('Inactive', 'Suspended') for u in user_rows), 'audit_events_count': in_window(audit_q, AuditLog.created_at, start, end).count()},
    })
    result['kpis'].update(total_users=len(user_rows))
    return result


def _median(values):
    ordered = sorted(values)
    if not ordered:
        return None
    mid = len(ordered) // 2
    return round(ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2, 1)


def case_lifecycle_summary(db, base, eligible_reports, cat_names, start, end, grouping, referral_q):
    """
    The case workflow's numbers, one place, same window as the rest of the payload.
      received / closed         cases reported / closed in the window. A closure is dated by closed_at (legacy closures
                                made before that column existed have no date, so they are not counted as closed in a window)
      resolved_share            of the closed cases, the share whose documented outcome is a resolution. A closed case is
                                NOT assumed resolved: unresolved and invalid closures are counted separately
      median_days_to_close      from report to closure
      outcomes                  by outcome group and disposition (a legacy closure is read from its legacy status)
      referrals                 by organisation, type and status; one case can have several
    """
    from app.models.case_records import CaseFollowUp, OwnershipClaim
    from app.utils import case_vocab as V

    rows = base.with_entities(Report.report_id, Report.created_at, Report.closed_at, Report.closure_disposition, Report.current_status_id,
                              Report.case_status, Report.reopened_count, Report.category_id).all()

    def status_of(r):
        return r.case_status if r.case_status in V.CASE_STATUSES else V.case_status_from_legacy(r.current_status_id)

    def within(value):
        return value is not None and start <= value < end

    received = [r for r in rows if within(r.created_at)]
    closed = [r for r in rows if status_of(r) == V.CLOSED and within(r.closed_at)]
    outcome_of = {r.report_id: V.effective_disposition(r.closure_disposition, r.current_status_id)[0] for r in closed}
    group_of = {rid: V.disposition_group(d) for rid, d in outcome_of.items()}
    resolved = sum(1 for g in group_of.values() if g == 'resolved')
    days = [(r.closed_at - r.created_at).total_seconds() / 86400 for r in closed if r.created_at and r.closed_at >= r.created_at]

    buckets, cursor = {}, bucket(start.date(), grouping)
    while cursor < end.date():
        buckets[cursor] = {'start_date': cursor.isoformat(), 'received': 0, 'closed': 0}
        cursor = next_bucket(cursor, grouping)
    for r in received:
        key = bucket(r.created_at.date(), grouping)
        if key in buckets:
            buckets[key]['received'] += 1
    for r in closed:
        key = bucket(r.closed_at.date(), grouping)
        if key in buckets:
            buckets[key]['closed'] += 1

    families = Counter(V.category_family(cat_names.get(r.category_id)) for r in received)
    outcomes = []
    for group in V.OUTCOME_GROUPS:
        items = [{'id': d, 'label': info[2], 'count': sum(1 for x in outcome_of.values() if x == d)} for d, info in V.DISPOSITIONS.items() if info[0] == group]
        outcomes.append({'group': group, 'count': sum(i['count'] for i in items), 'items': items})

    referral_rows = referral_q.with_entities(BarangayReferral.org_type, BarangayReferral.org_name, BarangayReferral.referral_status,
                                             BarangayReferral.final_outcome, BarangayReferral.barangay_id, BarangayReferral.referred_at).all()

    def referral_status(x):
        return x.referral_status or ('completed' if x.final_outcome else 'sent')

    in_period = [x for x in referral_rows if within(x.referred_at)]
    followups = db.query(CaseFollowUp.status, CaseFollowUp.due_at, CaseFollowUp.completed_at).filter(CaseFollowUp.report_id.in_(eligible_reports)).all()
    now = local_now().replace(tzinfo=None)
    claims = db.query(OwnershipClaim.status, OwnershipClaim.submitted_at).filter(OwnershipClaim.report_id.in_(eligible_reports)).all()
    return {
        'received': len(received), 'closed': len(closed),
        'resolved_share': percentage(resolved, len(closed)),
        'median_days_to_close': _median(days),
        'status_counts': {s: sum(1 for r in rows if status_of(r) == s) for s in V.CASE_STATUSES},
        'timeline': list(buckets.values()),
        'categories': sorted(({'id': k, 'label': V.CATEGORY_FAMILIES[k], 'count': families.get(k, 0)} for k in V.CATEGORY_FAMILIES),
                             key=lambda c: (-c['count'], c['label'])),
        'outcomes': outcomes,
        'closed_without_resolution': sum(1 for g in group_of.values() if g == 'unresolved'),
        'reopened': {'cases': sum(1 for r in rows if (r.reopened_count or 0) > 0), 'events': sum(r.reopened_count or 0 for r in rows)},
        'referrals': {
            'total': len(in_period),
            'open_now': sum(1 for x in referral_rows if referral_status(x) in V.OPEN_REFERRAL_STATUSES and not x.final_outcome),
            'by_type': [{'org_type': t, 'count': n} for t, n in Counter((x.org_type or ('barangay' if x.barangay_id else 'other')) for x in in_period).most_common()],
            'by_org': [{'name': n, 'count': c} for n, c in Counter((x.org_name or 'Unnamed') for x in in_period).most_common()],
            'by_status': [{'status': s, 'count': c} for s, c in Counter(referral_status(x) for x in in_period).most_common()],
        },
        'followups': {
            'pending': sum(1 for f in followups if f.status == 'pending'),
            'overdue': sum(1 for f in followups if f.status == 'pending' and f.due_at is not None and f.due_at < now),
            'completed_in_period': sum(1 for f in followups if f.status == 'done' and within(f.completed_at)),
        },
        'claims': {'submitted_in_period': sum(1 for c in claims if within(c.submitted_at)),
                   'open_now': sum(1 for c in claims if c.status in V.ACTIVE_CLAIM_STATUSES),
                   'accepted': sum(1 for c in claims if c.status == 'accepted'),
                   'rejected': sum(1 for c in claims if c.status == 'rejected')},
    }
