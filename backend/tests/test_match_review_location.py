"""Owner-only match reviews preserve each incident pin without exposing other private data."""
import os
import sys
import unittest
from pathlib import Path

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ.setdefault('JWT_SECRET_KEY', 'match-location-test-secret-0123456789')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.pet import Pet
from app.models.report import Report, ReportCategory, ReportStatus
from app.models.report_match import ReportMatch
from app.models.user import Barangay, Subdivision, User
from app.routes import matches, reports
from app.utils.auth import create_access_token
from app.utils.report_visibility import COMMUNITY_REPORTER


class MatchReviewLocationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        cls.Session = sessionmaker(bind=cls.engine, expire_on_commit=False)
        app = FastAPI()
        app.include_router(matches.router)
        app.include_router(reports.router)

        def database():
            with cls.Session() as db:
                yield db
        app.dependency_overrides[get_db] = database
        cls.client = TestClient(app)

    def setUp(self):
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)
        with self.Session() as db:
            db.add(Barangay(barangay_id=1, barangay_name='Test Barangay', city='Test City'))
            db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name='Selera Homes'))
            db.add(ReportCategory(category_id=1, category_name='Stray'))
            db.add_all(ReportStatus(status_id=i, status_name=f'Status {i}') for i in range(1, 19))
            self.headers = {}
            for uid, name, role in [(1, 'Pet Owner', 1), (2, 'Private Reporter', 1), (3, 'Leader', 2), (4, 'Other Resident', 1)]:
                db.add(User(user_id=uid, name=name, role_id=role, status='Active', is_verified=True,
                            email=f'user{uid}@example.invalid', password='x', subdivision_id=1, barangay_id=1))
                self.headers[uid] = {'Authorization': 'Bearer ' + create_access_token({'sub': str(uid), 'role_id': role})}
            db.flush()
            db.add_all([Pet(pet_id=1, owner_id=1, pet_name='Matched Pet', pet_type='Dog', status='Lost'),
                        Pet(pet_id=2, owner_id=4, pet_name='Other Pet', pet_type='Dog', status='Lost'),
                        Pet(pet_id=3, owner_id=1, pet_name='Unrelated Own Pet', pet_type='Dog', status='Lost')])
            db.add(Report(report_id=1, user_id=2, subdivision_id=1, category_id=1, current_status_id=2,
                          latitude=14.80108707, longitude=121.00457400,
                          initial_latitude=14.80108707, initial_longitude=121.00457400,
                          initial_landmark='Rose Street', visibility='Private',
                          description='Private reporter narrative', animal_type='Dog', ai_suggested_risk_level='Low'))
            db.flush()
            db.add(ReportMatch(source_report_id=1, matched_pet_id=1, similarity_score=85,
                               status='AI_SUGGESTED', owner_confirmation_status='PENDING'))
            db.commit()

    def review(self, uid=1, suffix=''):
        return self.client.get('/matches/case-review/1' + suffix, headers=self.headers[uid])

    def test_owner_review_keeps_the_exact_saved_pin(self):
        response = self.review()
        self.assertEqual(response.status_code, 200, response.text)
        report = response.json()['reports'][0]['report']
        self.assertEqual((report['latitude'], report['longitude']), (14.80108707, 121.004574))
        self.assertEqual((report['initial_latitude'], report['initial_longitude']), (14.80108707, 121.004574))
        self.assertEqual(report['initial_landmark'], 'Rose Street')
        self.assertEqual(report['reporter_name'], COMMUNITY_REPORTER)
        self.assertIsNone(report['reporter_photo'])
        self.assertIsNone(report['description'])
        self.assertIsNone(report['merge_notes'])

    def test_relocation_keeps_the_origin_separate_from_current_coordinates(self):
        with self.Session() as db:
            report = db.get(Report, 1)
            report.latitude, report.longitude = 14.806906, 121.0039297
            report.landmark, report.custody_status, report.current_status_id = 'Holding Facility', 'In Barangay Facility', 8
            db.commit()
        report = self.review().json()['reports'][0]['report']
        self.assertEqual((report['initial_latitude'], report['initial_longitude']), (14.80108707, 121.004574))
        self.assertEqual((report['latitude'], report['longitude']), (14.806906, 121.0039297))

    def test_each_merged_sighting_keeps_its_own_pin(self):
        with self.Session() as db:
            db.add(Report(report_id=2, user_id=2, subdivision_id=1, category_id=1, current_status_id=18,
                          latitude=14.80234567, longitude=121.00567891, initial_latitude=14.80234567,
                          initial_longitude=121.00567891, initial_landmark='Second Street', duplicate_of_report_id=1,
                          visibility='Private', animal_type='Dog'))
            db.flush()
            db.add(ReportMatch(source_report_id=2, matched_pet_id=1, similarity_score=80,
                               status='AI_SUGGESTED', owner_confirmation_status='PENDING'))
            db.commit()
        tabs = self.review().json()['reports']
        points = {tab['report_id']: (tab['report']['initial_latitude'], tab['report']['initial_longitude']) for tab in tabs}
        self.assertEqual(points, {1: (14.80108707, 121.004574), 2: (14.80234567, 121.00567891)})

    def test_missing_origin_is_not_replaced_with_a_facility(self):
        with self.Session() as db:
            report = db.get(Report, 1)
            report.initial_latitude = report.initial_longitude = report.initial_landmark = None
            report.current_status_id, report.custody_status = 8, 'In Barangay Facility'
            db.commit()
        report = self.review().json()['reports'][0]['report']
        self.assertIsNone(report['initial_latitude'])
        self.assertIsNone(report['initial_longitude'])
        self.assertIsNone(report['initial_landmark'])

    def test_unrelated_residents_and_unrelated_pet_parameters_are_rejected(self):
        self.assertEqual(self.review(uid=4).status_code, 403)
        self.assertEqual(self.review(suffix='?pet_id=2').status_code, 403)
        self.assertEqual(self.review(suffix='?pet_id=3').status_code, 403)
        self.assertEqual(self.review(uid=4, suffix='?pet_id=2').status_code, 403)

    def test_general_private_report_cards_remain_restricted(self):
        self.assertEqual(self.review().status_code, 200)
        response = self.client.get('/reports/1', headers=self.headers[1])
        self.assertEqual(response.status_code, 200, response.text)
        card = response.json()
        self.assertEqual(card['viewer_access'], 'match_owner')
        self.assertEqual(card['longitude'], 121.005)
        self.assertIsNone(card['initial_longitude'])
        self.assertIsNone(card['description'])
        self.assertEqual(self.client.get('/reports/1', headers=self.headers[4]).status_code, 404)

    def test_staff_review_and_report_use_the_same_origin_without_writing_it(self):
        review = self.review(uid=3).json()['reports'][0]['report']
        report = self.client.get('/reports/1', headers=self.headers[3]).json()
        self.assertEqual((review['initial_latitude'], review['initial_longitude']),
                         (report['initial_latitude'], report['initial_longitude']))
        with self.Session() as db:
            saved = db.get(Report, 1)
            self.assertEqual(float(saved.longitude), 121.004574)
            self.assertEqual(saved.visibility, 'Private')


if __name__ == '__main__':
    unittest.main()
