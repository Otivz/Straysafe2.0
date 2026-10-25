"""Staff claim decisions update pet records without a second potential-match approval."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ.setdefault('JWT_SECRET_KEY', 'claim-identity-test-secret-0123456789')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.pet import Pet
from app.models.pet_claim import PetClaim
from app.models.pet_history import PetHistory
from app.models.report import Report, ReportCategory, ReportStatus, ReportReturn, StatusHistory
from app.models.report_match import ReportMatch
from app.models.user import Barangay, Subdivision, User
from app.routes import claims
from app.utils.auth import create_access_token
from app.utils.claim_identity import sync_approved_claim_identity


class ClaimIdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        cls.Session = sessionmaker(bind=cls.engine, expire_on_commit=False)
        api = FastAPI()
        api.include_router(claims.router)

        def database():
            with cls.Session() as db:
                yield db
        api.dependency_overrides[get_db] = database
        cls.client = TestClient(api)

    def setUp(self):
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)
        for name in ('notify_claim_decision', 'notify_pet_reunited'):
            self.addCleanup(patch.stopall)
            patch('app.routes.claims.' + name).start()
        with self.Session() as db:
            db.add(Barangay(barangay_id=1, barangay_name='B1', city='City'))
            db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name='S1'))
            db.add(ReportCategory(category_id=1, category_name='Stray'))
            db.add_all(ReportStatus(status_id=i, status_name=f'Status {i}') for i in range(1, 19))
            self.headers = {}
            for uid, role in [(1, 1), (2, 2), (3, 3), (4, 4)]:
                db.add(User(user_id=uid, name=f'User {uid}', role_id=role, status='Active', is_verified=True,
                            email=f'user{uid}@example.invalid', password='x', subdivision_id=1, barangay_id=1))
                self.headers[uid] = {'Authorization': 'Bearer ' + create_access_token({'sub': str(uid), 'role_id': role})}
            db.flush()
            db.add_all([Pet(pet_id=1, owner_id=1, pet_name='Boyet', pet_type='Dog', status='Lost'),
                        Pet(pet_id=2, owner_id=1, pet_name='Other Pet', pet_type='Dog', status='Active')])
            db.add(self.report(1))
            db.flush()
            db.add(PetClaim(claim_id=1, report_id=1, pet_id=1, status='Pending Review'))
            db.add(ReportMatch(match_id=1, source_report_id=1, matched_pet_id=1, similarity_score=83,
                               ai_explanation='Original AI evidence', owner_notes='My dog',
                               status='AI_SUGGESTED', owner_confirmation_status='OWNER_CONFIRMED'))
            db.commit()

    @staticmethod
    def report(rid, **kwargs):
        return Report(report_id=rid, user_id=1, subdivision_id=1, category_id=1,
                      current_status_id=kwargs.pop('current_status_id', 2), latitude=14.8, longitude=121.0,
                      initial_latitude=14.801418, initial_longitude=121.004062,
                      initial_landmark='Original Street', animal_type='Dog', **kwargs)

    def decide(self, decision='Approved', uid=2, **extra):
        return self.client.patch('/claims/1/status', json={'status': decision, **extra}, headers=self.headers[uid])

    def test_staff_claim_approval_links_pet_and_confirms_existing_suggestion(self):
        response = self.decide()
        self.assertEqual(response.status_code, 200, response.text)
        with self.Session() as db:
            self.assertEqual(db.get(Report, 1).pet_id, 1)
            self.assertEqual(db.get(Pet, 1).status, 'Active')
            match = db.get(ReportMatch, 1)
            self.assertEqual((match.status, match.owner_confirmation_status, match.reviewed_by),
                             ('CONFIRMED_MATCH', 'OWNER_CONFIRMED', 2))
            self.assertEqual((match.similarity_score, match.ai_explanation, match.owner_notes),
                             (83, 'Original AI evidence', 'My dog'))
            event = db.query(PetHistory).filter_by(event_type='CLAIM_APPROVED').one()
            self.assertEqual((event.pet_id, event.actor_id, event.recovery_method), (1, 2, 'Approved Pet Claim'))
            self.assertAlmostEqual(float(event.latitude), 14.801418)

    def test_barangay_and_admin_use_the_same_sync(self):
        for uid in (3, 4):
            with self.subTest(role=uid):
                self.assertEqual(self.decide(uid=uid).status_code, 200)
                with self.Session() as db:
                    self.assertEqual(db.get(Report, 1).pet_id, 1)

    def test_pending_owner_feedback_is_supplied_by_verified_ownership_claim(self):
        with self.Session() as db:
            db.get(ReportMatch, 1).owner_confirmation_status = 'PENDING'
            db.commit()
        self.assertEqual(self.decide().status_code, 200)
        with self.Session() as db:
            self.assertEqual(db.get(ReportMatch, 1).owner_confirmation_status, 'OWNER_CONFIRMED')
            self.assertEqual(db.get(Report, 1).pet_id, 1)

    def test_direct_handover_also_links_without_prior_match_approval(self):
        response = self.decide('Handover Complete', bypass_handover_photo=True)
        self.assertEqual(response.status_code, 200, response.text)
        with self.Session() as db:
            report = db.get(Report, 1)
            self.assertEqual((report.pet_id, report.custody_status), (1, 'Claimed by Owner'))
            self.assertEqual(db.query(ReportReturn).one().pet_id, 1)
            self.assertEqual(db.get(ReportMatch, 1).status, 'CONFIRMED_MATCH')

    def test_manual_claim_does_not_invent_an_ai_score_or_suggestion(self):
        with self.Session() as db:
            db.delete(db.get(ReportMatch, 1))
            db.commit()
        self.assertEqual(self.decide().status_code, 200)
        with self.Session() as db:
            self.assertEqual(db.get(Report, 1).pet_id, 1)
            self.assertEqual(db.query(ReportMatch).count(), 0)

    def test_pending_and_rejected_claims_do_not_link_identity(self):
        for decision in ('Pending Review', 'Evidence Requested', 'Rejected'):
            self.assertEqual(self.decide(decision).status_code, 200)
            with self.Session() as db:
                self.assertIsNone(db.get(Report, 1).pet_id)
                self.assertEqual(db.get(ReportMatch, 1).status, 'AI_SUGGESTED')

    def test_resident_cannot_approve_own_claim(self):
        self.assertEqual(self.decide(uid=1).status_code, 403)
        with self.Session() as db:
            self.assertIsNone(db.get(Report, 1).pet_id)

    def test_rejected_matches_need_conflict_resolution(self):
        for field, value in [('status', 'NOT_A_MATCH'), ('owner_confirmation_status', 'OWNER_REJECTED')]:
            with self.subTest(field=field):
                with self.Session() as db:
                    m = db.get(ReportMatch, 1)
                    m.status, m.owner_confirmation_status = 'AI_SUGGESTED', 'OWNER_CONFIRMED'
                    setattr(m, field, value)
                    db.commit()
                self.assertEqual(self.decide().status_code, 409)
                with self.Session() as db:
                    self.assertIsNone(db.get(Report, 1).pet_id)
                    self.assertEqual(db.get(PetClaim, 1).status, 'Pending Review')
                    self.assertEqual(db.get(Pet, 1).status, 'Lost')

    def test_conflicting_pet_identity_rolls_back_entire_handover(self):
        with self.Session() as db:
            db.get(Report, 1).pet_id = 2
            db.commit()
        response = self.decide('Handover Complete', bypass_handover_photo=True)
        self.assertEqual(response.status_code, 409, response.text)
        with self.Session() as db:
            self.assertEqual(db.get(Report, 1).pet_id, 2)
            self.assertEqual(db.get(PetClaim, 1).status, 'Pending Review')
            self.assertEqual(db.query(ReportReturn).count(), 0)

    def test_repeat_decisions_do_not_duplicate_identity_history(self):
        self.assertEqual(self.decide().status_code, 200)
        self.assertEqual(self.decide().status_code, 200)
        self.assertEqual(self.decide('Handover Complete', bypass_handover_photo=True).status_code, 200)
        with self.Session() as db:
            self.assertEqual(db.query(PetHistory).filter_by(event_type='CLAIM_APPROVED').count(), 1)
            self.assertEqual(db.query(ReportMatch).count(), 1)

    def test_merged_sightings_inherit_identity_without_overstating_behavior(self):
        with self.Session() as db:
            db.get(Report, 1).verification_status = 'verified_true'
            db.get(Report, 1).verified_actual_bite = True
            db.add(self.report(2, current_status_id=18, duplicate_of_report_id=1,
                               verification_status='verified_true', verified_actual_bite=True))
            db.commit()
        self.assertEqual(self.decide().status_code, 200)
        with self.Session() as db:
            self.assertEqual((db.get(Report, 2).pet_id, db.get(Report, 2).pet_inherited_from_match_id), (1, 1))
            self.assertEqual(db.get(Pet, 1).bite_incident_count, 1)

    def test_existing_completed_claim_can_be_repaired_idempotently(self):
        with self.Session() as db:
            claim = db.get(PetClaim, 1)
            claim.status = 'Handover Complete'
            db.get(Report, 1).current_status_id = 9
            reviewer = db.get(User, 2)
            sync_approved_claim_identity(db, claim, reviewer)
            sync_approved_claim_identity(db, claim, reviewer)
            db.commit()
            self.assertEqual(db.get(Report, 1).pet_id, 1)
            self.assertEqual(db.query(PetHistory).filter_by(event_type='CLAIM_APPROVED').count(), 1)
            self.assertEqual(db.query(StatusHistory).count(), 1)


if __name__ == '__main__':
    unittest.main()
