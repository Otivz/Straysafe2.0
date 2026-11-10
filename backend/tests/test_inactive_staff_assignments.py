"""Inactive staff cannot receive case work (claim, take-over, transfer), even through direct API calls."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ.setdefault('JWT_SECRET_KEY', 'test-inactive-assignment-secret-0123456789')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.user import Barangay, Subdivision, User
from app.models.report import Report, ReportCategory, ReportStatus
from app.routes import reports
from app.utils.auth import create_access_token


class InactiveAssignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        cls.Session = sessionmaker(bind=cls.engine, expire_on_commit=False)
        app = FastAPI()
        app.include_router(reports.router)

        def database():
            with cls.Session() as db:
                yield db
        app.dependency_overrides[get_db] = database
        cls.client = TestClient(app, raise_server_exceptions=False)

    def setUp(self):
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)
        with self.Session() as db:
            db.add(Barangay(barangay_id=1, barangay_name='Test Barangay', city='Test City'))
            db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name='Test Subdivision'))
            db.add(ReportCategory(category_id=1, category_name='Roaming'))
            db.add_all(ReportStatus(status_id=i, status_name=f'Status {i}') for i in range(1, 19))
            self.tokens = {}
            for uid, name, role, state, head in [(1, 'Applicant', 1, 'Active', False), (2, 'Head', 3, 'Active', True),
                    (3, 'Active Responder', 3, 'Active', False), (4, 'Inactive Responder', 3, 'Inactive', False),
                    (5, 'Inactive Leader', 2, 'Inactive', False), (6, 'Admin', 4, 'Active', False),
                    (7, 'Inactive Head', 3, 'Inactive', True)]:
                db.add(User(user_id=uid, name=name, role_id=role, status=state, is_head_officer=head,
                            email=f'user{uid}@example.invalid', password='x', is_verified=True,
                            barangay_id=1, subdivision_id=1))
                self.tokens[uid] = {'Authorization': 'Bearer ' + create_access_token({'sub': str(uid), 'role_id': role})}
            db.flush()
            for report_id in (1, 2):
                db.add(Report(report_id=report_id, user_id=1, subdivision_id=1, category_id=1, latitude=14.8,
                              longitude=121, animal_type='Dog', current_status_id=13))
            db.commit()
    def assert_rejected(self, response, codes=(400,)):
        self.assertIn(response.status_code, codes, response.text)
        self.assertIn('active', response.text.lower())

    def test_claim_takeover_and_transfer_cannot_name_an_inactive_officer(self):
        for path, payload in [('claim', {'user_id': 5}), ('take-over', {'user_id': 5, 'reason': 'Reassign'}),
                ('transfer/request', {'user_id': 6, 'target_user_id': 5}), ('transfer/accept', {'user_id': 5})]:
            with self.subTest(path=path):
                self.assert_rejected(self.client.post(f'/reports/2/{path}', json=payload, headers=self.tokens[6]))
        with self.Session() as db:
            self.assertIsNone(db.get(Report, 2).assigned_leader_id)

    def test_inactive_staff_cannot_act_using_an_existing_token(self):
        response = self.client.post('/reports/2/claim', json={}, headers=self.tokens[7])
        self.assertEqual(response.status_code, 403, response.text)


if __name__ == '__main__':
    unittest.main()
