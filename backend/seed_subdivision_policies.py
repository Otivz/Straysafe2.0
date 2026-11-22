"""
Seed realistic animal policies for Subdivision ID 1 (Selera Homes).
Policies are stored inside the JSON case settings in `system_settings` table (key: `case_settings:1`).
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.utils import case_policy
from app.schemas.case import PolicyIn


REALISTIC_POLICIES = [
    PolicyIn(
        id="pol-leash-confinement",
        title="Leash and Confinement Requirement for Domestic Pets",
        reference="House Rules & By-Laws Art. IV §4.1",
        summary=(
            "All dogs and domestic pets must be kept securely confined within the resident's premises. "
            "When in common subdivision areas (streets, parks, sidewalks), pets must be on a secure leash "
            "not exceeding 1.5 meters held by a responsible person capable of controlling the animal. "
            "Unattended roaming animals are strictly prohibited."
        ),
        applies_to=["nuisance", "safety", "lost_pet", "found_animal"],
        observation_days=7,
        status="confirmed",
        fine_amount=1000.0,
        count_window_days=180,
    ),
    PolicyIn(
        id="pol-noise-nuisance",
        title="Control of Excessive Animal Noise and Habitual Barking",
        reference="House Rules & By-Laws Art. IV §4.2",
        summary=(
            "Pet owners must prevent continuous or habitual barking, howling, whining, or noise that causes "
            "disturbance to neighbors, especially during designated quiet hours (10:00 PM to 6:00 AM). "
            "Continuous barking exceeding 15 consecutive minutes is deemed a community nuisance."
        ),
        applies_to=["nuisance"],
        observation_days=7,
        status="confirmed",
        fine_amount=1000.0,
        count_window_days=180,
    ),
    PolicyIn(
        id="pol-waste-sanitation",
        title="Mandatory Pet Waste Clean-Up and Environmental Sanitation",
        reference="House Rules & By-Laws Art. IV §4.3",
        summary=(
            "Pet owners are strictly required to clean up, bag, and properly dispose of their pet's fecal waste "
            "immediately when walking their animals within subdivision roads, sidewalks, open spaces, and common areas. "
            "Accumulation of pet waste generating unsanitary odor on private lots is also prohibited."
        ),
        applies_to=["nuisance", "other"],
        observation_days=5,
        status="confirmed",
        fine_amount=500.0,
        count_window_days=90,
    ),
    PolicyIn(
        id="pol-aggressive-bite-control",
        title="Aggressive Animal Control and Mandatory Bite Incident Protocol",
        reference="House Rules & By-Laws Art. IV §4.4",
        summary=(
            "Animals demonstrating aggressive tendencies, charging at pedestrians, or chasing moving vehicles "
            "must be muzzled and double-leashed in public spaces. In any bite or scratch incident, the owner is "
            "strictly liable for all victim medical expenses (including post-exposure prophylaxis) and must quarantine "
            "the animal for a mandatory 14-day rabies observation period."
        ),
        applies_to=["safety", "injured"],
        observation_days=14,
        status="confirmed",
        fine_amount=2500.0,
        count_window_days=365,
    ),
    PolicyIn(
        id="pol-pet-registration-vaccination",
        title="Subdivision Pet Registration, QR Tagging, and Annual Rabies Immunization",
        reference="House Rules & By-Laws Art. IV §4.5",
        summary=(
            "All resident pet owners must register their dogs and cats in the official Subdivision Pet Registry, "
            "equip their pets with the StraySafe QR collar tag, and maintain up-to-date annual anti-rabies "
            "vaccination records with the HOA administration."
        ),
        applies_to=["lost_pet", "found_animal", "nuisance", "safety", "other"],
        observation_days=14,
        status="confirmed",
        fine_amount=1500.0,
        count_window_days=180,
    ),
]


def seed_policies(subdivision_id: int = 1):
    db = SessionLocal()
    try:
        settings = case_policy.load_settings(db, subdivision_id)
        existing_ids = {p.id for p in settings.policies}
        
        # Merge or update policies
        updated_policies = []
        for p in settings.policies:
            if p.id not in {rp.id for rp in REALISTIC_POLICIES}:
                updated_policies.append(p)
        
        for rp in REALISTIC_POLICIES:
            updated_policies.append(rp)
            print(f"Added/Updated policy: [{rp.reference}] {rp.title} ({rp.status})")

        settings.policies = updated_policies
        case_policy.save_settings(db, subdivision_id, settings, user_id=None)
        db.commit()
        print(f"Successfully saved {len(settings.policies)} policies for subdivision {subdivision_id}.")
    finally:
        db.close()


if __name__ == "__main__":
    subdivision_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    seed_policies(subdivision_id)
