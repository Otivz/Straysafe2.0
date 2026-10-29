"""Deterministic analytics regressions. No production DB, files or network required.

Run: python -m unittest discover -s backend/tests -p test_analytics.py -v
"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ.setdefault('JWT_SECRET_KEY', 'test-secret-key-for-analytics-0123456789')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.user import Barangay, Role, Subdivision, User
from app.models.report import HoldingAnimal, Report, ReportCategory, Rescue
from app.models.pet import Pet
from app.models.report_match import ReportMatch
from app.models.warning import OwnerWarning
from app.routes.analytics import router
from app.utils.auth import create_access_token


class AnalyticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clock = patch('app.services.analytics_service.local_now', return_value=datetime(2026, 10, 24, 12, tzinfo=timezone(timedelta(hours=8))))
        cls.clock.start()
        cls.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(cls.engine)
        cls.db = sessionmaker(bind=cls.engine, autoflush=False)()
        api = FastAPI()
        api.include_router(router)
        api.dependency_overrides[get_db] = lambda: cls.db
        cls.client = TestClient(api)
        cls.db.add_all([Role(role_id=i, role_name=name) for i, name in [(1, 'Citizen'), (2, 'Leader'), (3, 'Staff'), (4, 'Admin')]])
        cls.db.add(Barangay(barangay_id=1, barangay_name='San Vicente', city='Santa Maria'))
        cls.db.flush()
        cls.db.add_all([Subdivision(subdivision_id=i, barangay_id=1, subdivision_name=name) for i, name in [(1, 'Selera'), (2, 'Greenfields'), (3, 'Empty Area')]])
        for uid, role, scope in [(1, 1, 1), (2, 2, 1), (3, 2, 2), (4, 3, 1), (5, 4, None), (6, 2, None)]:
            cls.db.add(User(user_id=uid, name=f'User {uid}', email=f'user{uid}@test.invalid', password='not-used', role_id=role, subdivision_id=scope, is_verified=True, status='Active'))
        cls.db.add_all([ReportCategory(category_id=i, category_name=name) for i, name in [(1, 'Injured'), (2, 'Aggressive'), (4, 'Roaming')]])
        cls.db.flush()
        records = [
            (1, 1, 'Dog', 'Low', 1, '2026-10-22T08:00:00', 4),
            (2, 1, 'Dog', 'High', 6, '2026-10-23T12:00:00', 2),
            (3, 2, 'Cat', 'Medium', 11, '2026-10-24T23:59:59', 1),
            (4, 1, 'Cat', 'High', 9, '2026-10-24T00:00:00', 4),
            (5, 1, 'Dog', 'Low', 8, '2026-10-24T08:00:00', 4),
            (6, 1, 'Dog', 'Low', 18, '2026-10-24T08:00:00', 4),
            (7, 1, 'Cat', 'Low', 1, '2026-10-15T08:00:00', 4),
            (8, 1, 'Dog', 'Low', 3, '2026-10-01T08:00:00', 4),
            (9, 1, 'Dog', 'Low', 1, '2026-10-25T00:00:00', 4),
        ]
        for rid, scope, animal, priority, status, created, category in records:
            created = datetime.fromisoformat(created)
            cls.db.add(Report(report_id=rid, user_id=1, subdivision_id=scope, animal_type=animal, priority_level=priority, current_status_id=status, category_id=category, created_at=created, latitude=14.8, longitude=121,
                              verified_at=created + timedelta(hours=rid) if rid in (1, 2) else created - timedelta(hours=1) if rid == 4 else None,
                              split_from_report_id=1 if rid == 5 else None, duplicate_of_report_id=1 if rid == 6 else None))
        cls.db.flush()
        cls.db.add_all([
            Pet(pet_id=1, owner_id=1, pet_name='Expired', pet_type='Dog', is_vaccinated=True, vaccine_expiry=datetime(2026, 10, 23).date()),
            Pet(pet_id=2, owner_id=1, pet_name='Current', pet_type='Cat', is_vaccinated=True, vaccine_expiry=datetime(2026, 11, 1).date()),
            Pet(pet_id=3, registered_by_user_id=2, pet_name='Community animal', pet_type='Dog', is_vaccinated=True),
            Pet(pet_id=4, owner_id=1, pet_name='Archived', pet_type='Dog', status='Archived'),
        ])
        cls.db.add(OwnerWarning(warning_id=1, user_id=1, issued_by=2, violation_type='Free-Roaming Unleashed', description='Test warning', created_at=datetime(2026, 10, 22)))
        cls.db.add_all([
            HoldingAnimal(holding_id=1, report_id=5, animal_name='Child animal', animal_type='Dog', facility_status=6, intake_date=datetime(2026, 10, 23)),
            HoldingAnimal(holding_id=2, report_id=2, animal_name='Impounded', animal_type='Dog', facility_status=8, intake_date=datetime(2026, 10, 23)),
            HoldingAnimal(holding_id=3, report_id=4, animal_name='Claimed', animal_type='Cat', facility_status=3, intake_date=datetime(2026, 10, 23), discharge_date=datetime(2026, 10, 24)),
        ])
        cls.db.add_all([
            Rescue(rescue_id=1, report_id=2, status_id=6, started_at=datetime(2026, 10, 23, 8), completed_at=datetime(2026, 10, 23, 10)),
            Rescue(rescue_id=2, report_id=1, status_id=6, started_at=datetime(2026, 10, 23, 10), completed_at=datetime(2026, 10, 23, 9)),
            Rescue(rescue_id=3, report_id=3, status_id=3, started_at=datetime(2026, 10, 23, 8), completed_at=datetime(2026, 10, 23, 10)),
        ])
        cls.db.flush()
        cls.db.commit()

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        cls.db.close()
        cls.engine.dispose()
        cls.clock.stop()

    def tearDown(self):
        self.db.rollback()

    def get(self, path='/analytics/admin', user=5, **params):
        headers = {'Authorization': 'Bearer ' + create_access_token(data={'sub': str(user), 'role_id': {1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 2}[user]})} if user else {}
        return self.client.get(path, params=params, headers=headers)

    def test_access_and_subdivision_scope(self):
        for uid, status in [(None, 401), (1, 403), (4, 403), (2, 403), (5, 200)]:
            with self.subTest(user=uid): self.assertEqual(self.get(user=uid).status_code, status)
        self.assertEqual(self.get('/analytics/subdivision', user=6).status_code, 403)
        self.assertEqual(self.get('/analytics/subdivision', user=2, subdivision_id=2).status_code, 403)
        self.assertEqual(self.get('/analytics/subdivision', user=2).json()['subdivision']['id'], 1)
        self.assertEqual(self.get('/analytics/subdivision', user=5).status_code, 422)
        self.assertEqual(self.get(subdivision_id=999).status_code, 404)

    def test_picked_up_remains_active_and_duplicates_excluded(self):
        data = self.get('/analytics/subdivision', user=2).json()
        self.assertEqual(data['kpis']['total_reports'], 5)
        self.assertEqual(data['kpis']['active_reports'], 3)
        self.assertEqual(data['kpis']['resolved_reports'], 1)
        self.assertEqual(data['kpis']['closed_reports'], 2)

    def test_inclusive_custom_dates_and_future_midnight_excluded(self):
        data = self.get(start_date='2026-10-24', end_date='2026-10-24').json()
        self.assertEqual(data['kpis']['total_reports'], 2)
        self.assertEqual(data['incident_timeline'][0]['total'], 2)
        self.assertEqual(data['metadata']['timezone'], 'Asia/Manila')

    def test_filter_combinations_apply_across_metrics(self):
        data = self.get(days=7, subdivision_id=1, animal_type='Dog', priority='High', category_id=2, status='active').json()
        self.assertEqual(data['kpis']['total_reports'], 1)
        self.assertEqual(sum(data['animal_distribution'].values()), 1)
        self.assertEqual(data['category_breakdown'][0]['category'], 'Aggressive')
        self.assertEqual(data['sla_metrics']['total_completed_rescues'], 1)
        self.assertEqual(len(data['subdivisions_comparison']), 1)

    def test_zero_filled_daily_weekly_and_monthly_timeline(self):
        for group, size in [('day', 7), ('week', 2), ('month', 1)]:
            with self.subTest(group=group):
                response = self.get(days=7, group_by=group)
                self.assertEqual(response.status_code, 200)
                points = response.json()['incident_timeline']
                self.assertEqual(len(points), size)
                self.assertEqual(sum(p['total'] for p in points), 4)
        points = self.get(days=7).json()['incident_timeline']
        self.assertEqual(points[0]['total'], 0)
        self.assertEqual(points[0]['date'], '2026-10-18')

    def test_equal_previous_period(self):
        data = self.get(days=7).json()
        self.assertEqual(data['comparison']['previous_total'], 1)
        self.assertEqual(data['comparison']['report_change_percent'], 300)
        self.assertFalse(self.get().json()['comparison']['available'])

    def test_all_time_includes_events_older_than_first_incident(self):
        self.db.add(OwnerWarning(user_id=1, issued_by=2, violation_type='Other', description='Historical warning', created_at=datetime(2020, 1, 1)))
        self.db.flush()
        data = self.get('/analytics/subdivision', user=2).json()
        self.assertEqual(data['kpis']['total_warnings'], 2)
        self.assertEqual(data['metadata']['start_date'], '2020-01-01')

    def test_empty_area_has_null_rates_and_no_invented_ai_score(self):
        data = self.get(days=7, subdivision_id=3).json()
        self.assertEqual(data['kpis']['total_reports'], 0)
        self.assertIsNone(data['kpis']['resolution_rate'])
        self.assertIsNone(data['kpis']['avg_verification_hours'])
        self.assertIsNone(data['ai_performance']['average_confidence_score'])
        self.assertIsNone(data['ai_performance']['review_acceptance_rate'])

    def test_registry_snapshot_includes_ownerless_pets_and_excludes_expired_vaccination(self):
        data = self.get('/analytics/subdivision', user=2, days=7).json()
        self.assertEqual(data['pet_compliance']['total_pets'], 3)
        self.assertEqual(data['pet_compliance']['vaccinated'], 2)
        filtered = self.get('/analytics/subdivision', user=2, days=7, animal_type='Dog').json()
        self.assertEqual(filtered['pet_compliance']['total_pets'], 2)
        self.assertEqual(filtered['pet_compliance']['vaccinated'], 1)

    def test_holding_child_animals_and_all_active_custody_states(self):
        data = self.get(days=7).json()
        self.assertEqual(data['holding_summary']['total_intake'], 3)
        self.assertEqual(data['holding_summary']['currently_held'], 2)
        self.assertEqual(data['holding_summary']['returned_to_owner'], 1)

    def test_only_valid_completed_rescue_durations(self):
        data = self.get(days=7).json()
        self.assertEqual(data['sla_metrics']['total_completed_rescues'], 1)
        self.assertEqual(data['sla_metrics']['avg_rescue_hours'], 2)
        self.assertEqual(data['sla_metrics']['avg_verification_hours'], 1.5)
        self.assertNotIn('holding_and_adoption', data)  # adoption was removed from the system

    def test_ai_review_rate_is_not_reunion_or_precision(self):
        self.db.add_all([ReportMatch(source_report_id=1, status='CONFIRMED_MATCH', similarity_score=90, created_at=datetime(2026, 10, 23)), ReportMatch(source_report_id=2, status='NOT_A_MATCH', similarity_score=70, created_at=datetime(2026, 10, 23))])
        self.db.flush()
        data = self.get(days=7).json()['ai_performance']
        self.assertEqual(data['reviewed_matches'], 2)
        self.assertEqual(data['review_acceptance_rate'], 50)
        self.assertEqual(data['average_confidence_score'], 90)

    def test_invalid_filters_are_rejected(self):
        for params in [dict(days=0), dict(days=-1), dict(days=9999), dict(start_date='2026-10-23'), dict(start_date='2026-10-24', end_date='2026-10-22'), dict(start_date='2026-10-22', end_date='2026-10-25'), dict(days=7, start_date='2026-10-22', end_date='2026-10-24'), dict(group_by='hour'), dict(animal_type='Snake'), dict(category_id=999), dict(days=1000, group_by='day')]:
            with self.subTest(params=params): self.assertEqual(self.get(**params).status_code, 422)

    def test_query_count_does_not_scale_with_subdivision_count(self):
        def measure():
            queries = []
            def record(*args): queries.append(args[2])
            event.listen(self.engine, 'before_cursor_execute', record)
            try: self.assertEqual(self.get(days=7).status_code, 200)
            finally: event.remove(self.engine, 'before_cursor_execute', record)
            return len(queries)
        before = measure()
        self.db.add_all([Subdivision(subdivision_id=i, subdivision_name=f'Extra {i}', barangay_id=1) for i in range(10, 30)])
        self.db.flush()
        self.assertLessEqual(measure(), before + 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
