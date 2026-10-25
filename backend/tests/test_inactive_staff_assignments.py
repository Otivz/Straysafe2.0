"""Inactive staff cannot receive case, rescue or adoption work, even through direct API calls."""
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
from app.models.report import (Adoption, AdoptionAssignment, HoldingAnimal, Report, ReportCategory,
                               ReportStatus, Rescue, RescueAssignment)
from app.routes import adoption_tasks, adoptions, reports, rescue
from app.utils.auth import create_access_token


class InactiveAssignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        cls.Session = sessionmaker(bind=cls.engine, expire_on_commit=False)
        app = FastAPI()
        for router in (reports.router, rescue.router, adoption_tasks.router, adoptions.router):
            app.include_router(router)

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
            db.flush()
            db.add(Rescue(rescue_id=1, report_id=1, staff_id=3, status_id=2))
            db.add(HoldingAnimal(holding_id=1, report_id=1, animal_name='Test Pet', animal_type='Dog', facility_status=6))
            db.flush()
            db.add(RescueAssignment(rescue_id=1, staff_id=3, user_id=3, assigned_by=2, assignment_status='Assigned'))
            db.add(Adoption(adoption_id=1, holding_id=1, applicant_id=1, case_owner_id=2, status='Approved',
                            current_stage='Handover', full_name='Applicant', address='Test Address',
                            contact_no='09000000000', reason='A suitable permanent home for this animal.'))
            db.commit()
        self.dispatch = patch.object(rescue, 'dispatch_notification', return_value=None)
        self.dispatch.start()
        self.addCleanup(self.dispatch.stop)

    def assert_rejected(self, response, codes=(400,)):
        self.assertIn(response.status_code, codes, response.text)
        self.assertIn('active', response.text.lower())

    def assert_original_team(self):
        with self.Session() as db:
            self.assertEqual(db.get(Rescue, 1).staff_id, 3)
            self.assertEqual(db.get(Rescue, 1).status_id, 2)
            self.assertEqual([(a.staff_id, a.assignment_status) for a in db.query(RescueAssignment).all()], [(3, 'Assigned')])

    def test_single_responder_and_mixed_team_updates_are_rejected_atomically(self):
        for payload in ({'assigned_personnel_id': 4}, {'assigned_personnel_ids': [3, 4], 'status_id': 5}):
            with self.subTest(payload=payload):
                self.assert_rejected(self.client.patch('/rescue-requests/1', json=payload, headers=self.tokens[2]))
                self.assert_original_team()

    def test_legacy_primary_staff_field_cannot_bypass_validation(self):
        self.assert_rejected(self.client.patch('/rescue-requests/1', json={'barangay_staff_id': 4}, headers=self.tokens[2]))
        self.assert_original_team()

    def test_assign_team_endpoint_rejects_inactive_before_creating_a_rescue(self):
        self.assert_rejected(self.client.post('/rescue-requests/assign-team', json={'report_id': 2, 'assigned_personnel_ids': [3, 4]}, headers=self.tokens[2]))
        with self.Session() as db:
            self.assertEqual(db.query(Rescue).count(), 1)
        self.assert_original_team()

    def test_admin_direct_dispatch_cannot_assign_inactive_staff(self):
        self.assert_rejected(self.client.patch('/reports/1/status', json={'status_id': 5, 'assigned_staff_id': 4}, headers=self.tokens[6]))
        with self.Session() as db:
            self.assertEqual(db.get(Report, 1).current_status_id, 13)
        self.assert_original_team()

    def test_claim_takeover_and_transfer_cannot_name_an_inactive_officer(self):
        for path, payload in [('claim', {'user_id': 5}), ('take-over', {'user_id': 5, 'reason': 'Reassign'}),
                ('transfer/request', {'user_id': 6, 'target_user_id': 5}), ('transfer/accept', {'user_id': 5})]:
            with self.subTest(path=path):
                self.assert_rejected(self.client.post(f'/reports/2/{path}', json=payload, headers=self.tokens[6]))
        with self.Session() as db:
            self.assertIsNone(db.get(Report, 2).assigned_leader_id)

    def test_every_adoption_task_type_rejects_inactive_staff(self):
        for task in ('Verification', 'Interview', 'Home_Visit', 'Handover', 'Monitoring', 'Other'):
            with self.subTest(task=task):
                self.assert_rejected(self.client.post('/adoptions/1/assignments', json={'task_type': task, 'assigned_to': 4}, headers=self.tokens[2]))
        with self.Session() as db:
            self.assertEqual(db.query(AdoptionAssignment).count(), 0)

    def test_adoption_options_exclude_inactive_personnel(self):
        result = self.client.get('/adoptions/1/assignable-staff', headers=self.tokens[2])
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual({row['user_id'] for row in result.json()}, {2, 3})

    def test_handover_rejects_inactive_ids_and_legacy_names(self):
        for staff in ({'assigned_staff_id': 4}, {'assigned_staff': 'Inactive Responder'}):
            self.assert_rejected(self.client.post('/adoptions/1/handover/schedule', json={'handover_date': '2026-10-27T10:00:00', **staff}, headers=self.tokens[2]))
        with self.Session() as db:
            self.assertIsNone(db.get(Adoption, 1).handover_assigned_staff)
            self.assertIsNone(db.get(Adoption, 1).handover_scheduled_date)

    def test_staff_deactivated_after_opening_the_form_is_rejected(self):
        with self.Session() as db:
            db.get(User, 3).status = 'Inactive'
            db.commit()
        self.assert_rejected(self.client.post('/adoptions/1/handover/schedule', json={'handover_date': '2026-10-27T10:00:00', 'assigned_staff_id': 3}, headers=self.tokens[2]))

    def test_an_open_adoption_task_with_an_inactive_assignee_requires_reassignment(self):
        with self.Session() as db:
            db.add(AdoptionAssignment(adoption_id=1, task_type='Handover', assigned_to=4,
                                      assigned_to_name='Inactive Responder', assigned_by=2, status='Accepted'))
            db.commit()
        self.assert_rejected(self.client.post('/adoptions/1/handover/schedule', json={
            'handover_date': '2026-10-27T10:00:00', 'assigned_staff_id': 3,
        }, headers=self.tokens[2]), codes=(409,))
        # The owner can replace the old assignee with active personnel through the task assignment endpoint.
        reassigned = self.client.post('/adoptions/1/assignments', json={'task_type': 'Handover', 'assigned_to': 3}, headers=self.tokens[2])
        self.assertEqual(reassigned.status_code, 200, reassigned.text)
        with self.Session() as db:
            old = db.query(AdoptionAssignment).filter(AdoptionAssignment.assigned_to == 4).one()
            self.assertEqual(old.status, 'Reassigned')

    def test_inactive_adoption_case_owner_cannot_be_selected_for_transfer(self):
        self.assert_rejected(self.client.post('/adoptions/1/transfer', json={
            'to_user_id': 7, 'reason': 'Changing the handling officer',
        }, headers=self.tokens[2]))

    def test_active_handover_staff_still_work_and_names_come_from_database(self):
        response = self.client.post('/adoptions/1/handover/schedule', json={'handover_date': '2026-10-27T10:00:00', 'assigned_staff_id': 3, 'assigned_staff': 'Inactive Responder'}, headers=self.tokens[2])
        self.assertEqual(response.status_code, 200, response.text)
        with self.Session() as db:
            self.assertEqual(db.get(Adoption, 1).handover_assigned_staff, 'Active Responder')

    def test_inactive_staff_cannot_act_using_an_existing_token(self):
        response = self.client.post('/adoptions/1/claim', json={}, headers=self.tokens[7])
        self.assertEqual(response.status_code, 403, response.text)

    def test_active_rescue_assignment_still_succeeds(self):
        response = self.client.patch('/rescue-requests/1', json={'assigned_personnel_ids': [3]}, headers=self.tokens[2])
        self.assertEqual(response.status_code, 200, response.text)
        with self.Session() as db:
            self.assertEqual(db.get(Rescue, 1).staff_id, 3)


if __name__ == '__main__':
    unittest.main()
