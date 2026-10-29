"""Custody, jurisdiction and physical handover govern staff profile/photo edits."""
import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ.setdefault('JWT_SECRET_KEY', 'pet-record-access-tests-secret-0123456789')
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
from app.utils import uploads
from app.utils.auth import create_access_token

PHOTO = 'https://res.cloudinary.com/demo/image/upload/pets/new-photo.png'


class PetRecordAccessTests(unittest.TestCase):
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
        for target, kwargs in [
            ('app.routes.pets.auto_extract_pet_colors', {}),
            ('app.routes.pets.upload_to_cloudinary', {'return_value': PHOTO}),
            ('app.routes.pets.read_and_validate_upload', {'new': AsyncMock(return_value=(b'png', 'test.png', 'Image', 'image'))}),
            ('app.utils.uploads.CLOUDINARY_CLOUD_NAME', {'new': 'demo'}),
        ]:
            mock = patch(target, **kwargs)
            mock.start()
            self.addCleanup(mock.stop)
        with self.Session() as db:
            db.add_all([Barangay(barangay_id=i, barangay_name=f'B{i}', city='City') for i in (1, 2)])
            db.add_all([Subdivision(subdivision_id=i, barangay_id=b, subdivision_name=f'S{i}')
                        for i, b in [(1, 1), (2, 1), (3, 2)]])
            db.add(ReportCategory(category_id=1, category_name='Stray'))
            db.add_all(ReportStatus(status_id=i, status_name=f'Status {i}') for i in range(1, 19))
            self.headers = {}
            for uid, role, subd, brgy in [(1, 1, 1, 1), (2, 2, 1, 1), (3, 3, None, 1),
                                           (4, 4, None, None), (5, 2, 2, 1), (6, 3, None, 2), (8, 2, 1, 1), (9, 1, 1, 1)]:
                db.add(User(user_id=uid, name=f'User {uid}', role_id=role, status='Active', is_verified=True,
                            email=f'user{uid}@example.invalid', password='x', subdivision_id=subd, barangay_id=brgy))
                self.headers[uid] = {'Authorization': 'Bearer ' + create_access_token({'sub': str(uid), 'role_id': role})}
            db.add(Landmark(landmark_id=1, name='Barangay Facility', barangay_id=1, latitude=14.8,
                            longitude=121.0, is_holding_facility=True))
            db.flush()
            db.add_all([Pet(pet_id=1, pet_name='In Care', pet_type='Dog', registered_by_user_id=8, status='Active'),
                        Pet(pet_id=2, pet_name='Private Pet', pet_type='Cat', owner_id=1, registered_by_user_id=1, status='Active')])
            db.flush()
            db.add(self.report(1, pet_id=1))
            db.flush()
            db.add(HoldingAnimal(holding_id=1, report_id=1, animal_type='Dog', facility_status=2, intake_staff_id=3))
            db.commit()

    @staticmethod
    def report(rid, **kwargs):
        return Report(report_id=rid, user_id=1, subdivision_id=1, category_id=1, current_status_id=7,
                      latitude=14.8, longitude=121.0, facility_id=1,
                      custody_status='In Barangay Facility', animal_type='Dog', **kwargs)

    def photo(self, uid=3, pid=1, suffix='photo'):
        return self.client.post(f'/pets/{pid}/{suffix}', data={'url': PHOTO}, headers=self.headers[uid])


    def test_barangay_and_subdivision_can_edit_photos_registered_by_other_staff(self):
        for uid in (2, 3):
            for suffix in ('photo', 'photo-front', 'photo-left', 'photo-right', 'vaccine-card'):
                with self.subTest(uid=uid, suffix=suffix):
                    response = self.photo(uid=uid, suffix=suffix)
                    self.assertEqual(response.status_code, 200, response.text)

    def test_file_upload_matches_the_reported_failing_request(self):
        response = self.client.post('/pets/1/photo', files={'file': ('dog.png', b'png', 'image/png')}, headers=self.headers[3])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['photo_url'], PHOTO)
        with self.Session() as db:
            self.assertEqual(db.get(Pet, 1).photo_url, PHOTO)

    def test_other_subdivision_or_barangay_cannot_edit(self):
        for uid in (5, 6, 9):
            self.assertEqual(self.photo(uid=uid).status_code, 403)

    def test_registration_alone_does_not_grant_staff_edit_access(self):
        for uid in (2, 3, 8):
            self.assertEqual(self.photo(uid=uid, pid=2).status_code, 403)
        with self.Session() as db:
            db.get(Pet, 2).registered_by_user_id = 3
            db.get(Pet, 2).owner_id = None
            db.commit()
        self.assertEqual(self.photo(pid=2).status_code, 403)


    def test_released_animals_are_read_only_to_staff(self):
        for state in (3, 4, 5, 7, 8):
            with self.Session() as db:
                db.get(HoldingAnimal, 1).facility_status = state
                db.commit()
            self.assertEqual(self.photo().status_code, 403)
        with self.Session() as db:
            animal = db.get(HoldingAnimal, 1)
            animal.facility_status, animal.discharge_date = 2, datetime.now()
            db.commit()
        self.assertEqual(self.photo().status_code, 403)

    def test_owner_and_admin_permissions_are_preserved(self):
        self.assertEqual(self.photo(uid=1, pid=2).status_code, 200)
        self.assertEqual(self.photo(uid=4, pid=2).status_code, 200)

    def test_profile_edit_preserves_original_registrant_and_blocks_owner_bypass(self):
        response = self.client.put('/pets/1', json={'breed': 'Aspin', 'notes': 'Updated in care'}, headers=self.headers[3])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()['can_edit_record'])
        self.assertEqual(response.json()['registered_by_user_id'], 8)
        for payload in ({'owner_id': 1}, {'registered_by_user_id': 3}, {'registered_by_name': 'Other officer'}):
            self.assertEqual(self.client.put('/pets/1', json=payload, headers=self.headers[3]).status_code, 403)
        # Profile permission is not permission to delete or transfer records.
        self.assertEqual(self.client.delete('/pets/1', headers=self.headers[3]).status_code, 403)

    def test_list_and_detail_expose_the_same_permission_as_upload(self):
        records = self.client.get('/pets/', headers=self.headers[3]).json()
        permissions = {p['pet_id']: p['can_edit_record'] for p in records}
        self.assertEqual(permissions, {1: True, 2: False})
        self.assertTrue(self.client.get('/pets/1', headers=self.headers[3]).json()['can_edit_record'])

    def test_unverified_inherited_identity_is_not_proof_of_custody(self):
        with self.Session() as db:
            db.get(Report, 1).pet_inherited_from_match_id = 999
            db.commit()
        self.assertEqual(self.photo().status_code, 403)

    def test_merged_case_holding_can_use_trusted_sighting_identity(self):
        with self.Session() as db:
            db.get(Report, 1).pet_id = None
            db.add(self.report(2, pet_id=1, duplicate_of_report_id=1))
            db.commit()
        self.assertEqual(self.photo().status_code, 200)


    def test_facility_scope_controls_access_after_transfer(self):
        with self.Session() as db:
            facility = db.get(Landmark, 1)
            facility.barangay_id = 2
            db.commit()
        self.assertEqual(self.photo(uid=3).status_code, 403)
        self.assertEqual(self.photo(uid=2).status_code, 403)
        self.assertEqual(self.photo(uid=6).status_code, 200)

    def test_cats_in_care_can_also_be_edited(self):
        with self.Session() as db:
            db.get(Pet, 1).pet_type = 'Cat'
            db.commit()
        self.assertEqual(self.photo().status_code, 200)


if __name__ == '__main__':
    unittest.main()
