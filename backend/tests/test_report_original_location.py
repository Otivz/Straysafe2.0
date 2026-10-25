"""Read-only report serialization must not replace an unknown origin with a facility."""
import os
import sys
import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

os.environ.setdefault('DATABASE_URL', 'sqlite://')
os.environ.setdefault('JWT_SECRET_KEY', 'original-location-test-secret-0123456789')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.routes.reports import populate_location_and_facility_info  # noqa: E402


class OriginalLocationTests(unittest.TestCase):
    def serialize(self, **changes):
        report = SimpleNamespace(
            report_id=128, initial_landmark='', landmark='Barangay Animal Impound Facility',
            initial_latitude=Decimal('14.80141775'), initial_longitude=Decimal('121.00406153'),
            latitude=Decimal('14.80707662'), longitude=Decimal('121.00422872'),
            facility_id=4, subdivision_id=1, current_status_id=8,
            custody_status='In Barangay Facility', history=[],
        )
        for key, value in changes.items():
            setattr(report, key, value)
        facility = SimpleNamespace(
            landmark_id=4, subdivision_id=1, name='Barangay Animal Impound Facility', category='Facility',
            description=None, latitude=report.latitude, longitude=report.longitude,
            is_holding_facility=True, facility_type='Barangay', capacity=20,
            contact_person=None, contact_number=None, status='Active',
        )
        response = SimpleNamespace(landmark=report.landmark, latitude=report.latitude, longitude=report.longitude, history=[])
        db = Mock()
        db.query.side_effect = AssertionError('Unexpected database query')
        populate_location_and_facility_info(response, report, db, holding_map={}, landmarks_map={4: facility})
        db.query.assert_not_called()
        return response

    def test_blank_original_name_does_not_become_current_facility(self):
        response = self.serialize()
        self.assertIsNone(response.initial_landmark)
        self.assertEqual(response.initial_latitude, 14.80141775)
        self.assertEqual(response.initial_longitude, 121.00406153)
        self.assertEqual(response.facility['name'], 'Barangay Animal Impound Facility')

    def test_missing_original_coordinates_stay_missing(self):
        response = self.serialize(initial_latitude=None, initial_longitude=None)
        self.assertIsNone(response.initial_latitude)
        self.assertIsNone(response.initial_longitude)

    def test_resolution_does_not_fabricate_an_original_landmark(self):
        response = self.serialize(current_status_id=10, facility_id=None)
        self.assertIsNone(response.initial_landmark)
        self.assertIsNone(response.facility)
        self.assertEqual(response.latitude, 14.80141775)

    def test_a_saved_original_landmark_survives_relocation(self):
        response = self.serialize(initial_landmark='Near the basketball court')
        self.assertEqual(response.initial_landmark, 'Near the basketball court')
        self.assertEqual(response.landmark, 'Barangay Animal Impound Facility')

    def test_an_original_sighting_can_legitimately_be_at_a_facility(self):
        name = 'Barangay Animal Impound Facility'
        response = self.serialize(initial_landmark=name)
        self.assertEqual(response.initial_landmark, name)


if __name__ == '__main__':
    unittest.main()
