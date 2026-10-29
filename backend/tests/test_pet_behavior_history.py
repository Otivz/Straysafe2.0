"""Bite and chasing history: verified history comes only from verified reports; declarations can be added, not hidden."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ.setdefault('JWT_SECRET_KEY', 'pet-behavior-history-tests-secret-0123456789')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.landmark import Landmark
from app.models.pet import Pet
from app.models.report import HoldingAnimal, Report, ReportCategory, ReportStatus
from app.models.user import Barangay, Subdivision, User
from app.routes import pets
from app.utils.auth import create_access_token
from app.utils.case_groups import refresh_pet_behavior

RESIDENT, LEADER, STAFF, ADMIN = 1, 2, 3, 4
OWNED, IN_CARE = 2, 1


class PetBehaviorHistoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        cls.Session = sessionmaker(bind=cls.engine, expire_on_commit=False)
        api = FastAPI()
        api.include_router(pets.router)

        def database():
            with cls.Session() as db:
                yield db
        api.dependency_overrides[get_db] = database
        cls.client = TestClient(api)

    def setUp(self):
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)
        for target in ('app.routes.pets.auto_extract_pet_colors',):
            mock = patch(target)
            mock.start()
            self.addCleanup(mock.stop)
        with self.Session() as db:
            db.add(Barangay(barangay_id=1, barangay_name='B1', city='City'))
            db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name='S1'))
            db.add(ReportCategory(category_id=1, category_name='Stray'))
            db.add_all(ReportStatus(status_id=i, status_name=f'Status {i}') for i in range(1, 19))
            self.headers = {}
            for uid, role, subd, brgy in [(RESIDENT, 1, 1, 1), (LEADER, 2, 1, 1), (STAFF, 3, None, 1), (ADMIN, 4, None, None)]:
                db.add(User(user_id=uid, name=f'User {uid}', role_id=role, status='Active', is_verified=True,
                            email=f'user{uid}@example.invalid', password='x', subdivision_id=subd, barangay_id=brgy))
                self.headers[uid] = {'Authorization': 'Bearer ' + create_access_token({'sub': str(uid), 'role_id': role})}
            db.add(Landmark(landmark_id=1, name='Facility', barangay_id=1, latitude=14.8, longitude=121.0, is_holding_facility=True))
            db.flush()
            db.add_all([Pet(pet_id=IN_CARE, pet_name='In Care', pet_type='Dog', registered_by_user_id=LEADER, status='Active'),
                        Pet(pet_id=OWNED, pet_name='Brownie', pet_type='Dog', owner_id=RESIDENT, registered_by_user_id=RESIDENT,
                            status='Active', temperament='Anxious')])
            db.flush()
            db.add(Report(report_id=1, user_id=RESIDENT, subdivision_id=1, category_id=1, current_status_id=7, latitude=14.8,
                          longitude=121.0, facility_id=1, custody_status='In Barangay Facility', animal_type='Dog', pet_id=IN_CARE))
            db.flush()
            db.add(HoldingAnimal(holding_id=1, report_id=1, animal_type='Dog', facility_status=2, intake_staff_id=STAFF))
            db.commit()

    def pet(self, pid):
        with self.Session() as db:
            return db.get(Pet, pid)

    def put(self, uid, pid, body):
        return self.client.put(f'/pets/{pid}', json=body, headers=self.headers[uid])

    def verified_bite(self, pid, report_id=50, aggressive=False):
        """A verified incident report with a bite, directly confirmed as this pet, then the recount."""
        with self.Session() as db:
            db.add(Report(report_id=report_id, user_id=RESIDENT, subdivision_id=1, category_id=1, current_status_id=2,
                          latitude=14.8, longitude=121.0, animal_type='Dog', pet_id=pid, verification_status='verified_true',
                          verified_actual_bite=True, verified_aggressive=aggressive))
            db.flush()
            refresh_pet_behavior(db, db.get(Pet, pid))
            db.commit()

    # --- the reported problem: an owner hiding a bite history ---
    def test_owner_cannot_lower_verified_bite_or_chase_history(self):
        self.verified_bite(OWNED)
        for body in ({'has_bite_history': False}, {'bite_incident_count': 0}, {'chase_behavior': True},
                     {'chase_incident_count': 3}):
            with self.subTest(body=body):
                r = self.put(RESIDENT, OWNED, body)
                self.assertEqual(r.status_code, 403, r.text)
                self.assertIn('verified incident reports', r.json()['detail'])
        pet = self.pet(OWNED)
        self.assertTrue(pet.has_bite_history)
        self.assertEqual(pet.bite_incident_count, 1)

    def test_staff_and_admin_cannot_edit_verified_history_either(self):
        self.verified_bite(IN_CARE)
        for uid in (LEADER, STAFF):
            self.assertEqual(self.put(uid, IN_CARE, {'has_bite_history': False}).status_code, 403)
        self.verified_bite(OWNED, report_id=51)
        self.assertEqual(self.put(ADMIN, OWNED, {'bite_incident_count': 0}).status_code, 403)

    def test_whole_form_with_unchanged_values_still_saves(self):
        self.verified_bite(OWNED)
        r = self.put(RESIDENT, OWNED, {'pet_name': 'Brownie Jr', 'has_bite_history': True, 'bite_incident_count': 1,
                                       'chase_behavior': False, 'chase_incident_count': 0, 'temperament': 'Aggressive'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.pet(OWNED).pet_name, 'Brownie Jr')
        # a form sending null for an unknown answer doesn't erase anything
        self.assertEqual(self.put(RESIDENT, OWNED, {'has_bite_history': None, 'declared_bite_history': None}).status_code, 200)
        self.assertTrue(self.pet(OWNED).has_bite_history)

    # --- declarations ---
    def test_owner_can_declare_but_not_remove_a_declaration(self):
        r = self.put(RESIDENT, OWNED, {'declared_bite_history': True, 'declared_chase_behavior': True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()['declared_bite_history'])
        self.assertFalse(r.json()['has_bite_history'], 'a declaration is not verified history')
        for field in ('declared_bite_history', 'declared_chase_behavior'):
            r = self.put(RESIDENT, OWNED, {field: False})
            self.assertEqual(r.status_code, 403, r.text)
            self.assertIn('subdivision leader or barangay staff', r.json()['detail'])
        self.assertTrue(self.pet(OWNED).declared_bite_history)

    def test_staff_who_may_edit_the_record_can_remove_a_declaration(self):
        with self.Session() as db:
            db.get(Pet, IN_CARE).declared_bite_history = True
            db.commit()
        r = self.put(STAFF, IN_CARE, {'declared_bite_history': False})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(self.pet(IN_CARE).declared_bite_history)

    def test_registration_answers_become_declarations(self):
        body = {'pet_name': 'Rocky', 'pet_type': 'Dog', 'has_bite_history': True, 'bite_incident_count': 4,
                'chase_behavior': True, 'chase_incident_count': 2}
        r = self.client.post('/pets/', json=body, headers=self.headers[RESIDENT])
        self.assertIn(r.status_code, (200, 201), r.text)
        pet = self.pet(r.json()['pet_id'])
        self.assertTrue(pet.declared_bite_history)
        self.assertTrue(pet.declared_chase_behavior)
        self.assertFalse(pet.has_bite_history)
        self.assertEqual(pet.bite_incident_count or 0, 0)
        self.assertEqual(pet.chase_incident_count or 0, 0)

    # --- the recount from reports ---
    def test_recount_keeps_declarations_and_the_chosen_temperament(self):
        with self.Session() as db:
            pet = db.get(Pet, OWNED)
            pet.declared_bite_history = True
            refresh_pet_behavior(db, pet)
            db.commit()
        pet = self.pet(OWNED)
        self.assertTrue(pet.declared_bite_history, 'a report change must not erase the declaration')
        self.assertFalse(pet.has_bite_history)
        self.assertEqual(pet.temperament, 'Anxious', 'no verified aggression: the chosen temperament stays')

    def test_verified_bite_makes_temperament_aggressive_and_locks_it(self):
        self.verified_bite(OWNED)
        self.assertEqual(self.pet(OWNED).temperament, 'Aggressive')
        r = self.put(RESIDENT, OWNED, {'temperament': 'Friendly'})
        self.assertEqual(r.status_code, 403, r.text)
        self.assertIn('Aggressive', r.json()['detail'])
        self.assertEqual(self.put(STAFF, IN_CARE, {'temperament': 'Anxious'}).status_code, 200,
                         'without verified evidence the temperament can still be changed')

    # --- the one-time script ---
    def test_script_moves_unsupported_answers_to_declarations(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
        import split_declared_behavior as script
        with self.Session() as db:
            pet = db.get(Pet, OWNED)
            pet.has_bite_history, pet.bite_incident_count = True, 2   # an old owner answer in the verified columns
            db.commit()
        with self.Session() as db:
            changes = script.plan(db, db.get(Pet, OWNED))
        self.assertEqual(changes['declared_bite_history'], (False, True))
        self.assertEqual(changes['has_bite_history'], (True, False))
        self.assertEqual(changes['bite_incident_count'], (2, 0))
        self.verified_bite(IN_CARE)
        with self.Session() as db:
            self.assertEqual(script.plan(db, db.get(Pet, IN_CARE)), {}, 'a verified bite needs no change')


if __name__ == '__main__':
    unittest.main(verbosity=2)
