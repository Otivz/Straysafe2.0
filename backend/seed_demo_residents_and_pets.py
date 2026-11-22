"""
Idempotent seed script to populate STRAY-SAFE 2.0 with 50 realistic fictional
resident accounts in Selera Homes, each with at least one registered pet (65 pets total)
and active QR identification tags (`PetTag`).

Safe to run multiple times without duplicating or altering existing real user records.

Usage:
    cd backend
    python seed_demo_residents_and_pets.py
"""
import json
import os
import sys
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session

from app.models.notification_preference import UserNotificationPreference
from app.models.pet import Pet
from app.models.pet_tag import PetTag
from app.models.user import Barangay, Role, Subdivision, User
from app.services import pet_tags as pet_tag_service
from app.utils.auth import get_password_hash
from app.utils.color_tags import apply_pet_color_payload
from app.utils.password_policy import enforce_password_policy
from app.utils.phone import normalize_ph_phone

DEMO_PASSWORD_PLAIN = "SeleraResident#2026!"
DEMO_EMAIL_DOMAIN = "selerahomes.demo"
MANIFEST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo_pet_photos_manifest.json")

# 50 realistic fictional Filipino residents in Selera Homes, plus 1-2 pets each (65 pets total).
# Format of each entry:
# (full_name, email_local, phone, address, lat_offset, lng_offset, emergency_name, emergency_phone, [pets...])
# Each pet tuple:
# (pet_name, pet_type, breed, gender, birth_date, estimated_age, weight_kg, size_category,
#  colors_list, distinctive_markings, temperament, is_neutered, vax_date, vax_expiry, health_condition, notes)
RESIDENT_SEED_DATA: List[Tuple[str, str, str, str, str, str, str, str, List[Tuple[Any, ...]]]] = [
    (
        "Mateo Villanueva", "mateo.villanueva", "09172100101", "Block 1 Lot 2, Rose Street",
        "14.80051200", "121.00291500", "Elena Villanueva", "09172100901",
        [
            ("Bantay", "Dog", "Aspin (Asong Pinoy)", "Male", date(2022, 3, 15), "4 years old", "16.50", "Medium",
             ["Brown", "White"], "White diamond patch on chest, wears blue nylon collar", "Friendly", True,
             date(2026, 2, 10), date(2027, 2, 10), "Healthy, annual anti-rabies and 5-in-1 booster complete",
             "Friendly with neighbors and delivery riders; responds to whistles."),
            ("Muning", "Cat", "Puspin (Pusang Pinoy)", "Female", date(2023, 7, 20), "2 years old", "3.80", "Small",
             ["Calico", "White", "Orange"], "Tri-color calico patch over left ear, pink nose", "Friendly", True,
             date(2026, 3, 5), date(2027, 3, 5), "Healthy, indoor-outdoor cat, spayed",
             "Likes lounging near the front porch planters."),
        ],
    ),
    (
        "Clarisse Santos", "clarisse.santos", "09172100102", "Block 1 Lot 5, Rose Street",
        "14.80056800", "121.00301200", "Ramon Santos", "09172100902",
        [
            ("Mochi", "Dog", "Shih Tzu", "Female", date(2023, 1, 12), "3 years old", "5.20", "Small",
             ["White", "Gold"], "Fluffy topknot tied with peach ribbon, dark tear stain under right eye", "Friendly", True,
             date(2026, 1, 20), date(2027, 1, 20), "Healthy, regular grooming every 6 weeks",
             "Strict indoor lap dog; shy around loud motorcycles."),
        ],
    ),
    (
        "Gabriel Dela Cruz", "gabriel.delacruz", "09172100103", "Block 1 Lot 9, Rose Street",
        "14.80062100", "121.00311800", "Teresita Dela Cruz", "09172100903",
        [
            ("Tagpi", "Dog", "Aspin (Asong Pinoy)", "Male", date(2021, 11, 4), "4 years old", "18.00", "Medium",
             ["White", "Black"], "Large black patch over left eye and saddle mark on back", "Protective", True,
             date(2026, 4, 12), date(2027, 4, 12), "Healthy, dewormed and vaccinated against rabies",
             "Alert watchdog at the gate; calm when owner is present."),
        ],
    ),
    (
        "Marisol Mendoza", "marisol.mendoza", "09172100104", "Block 1 Lot 14, Rose Street",
        "14.80068500", "121.00321000", "Arturo Mendoza", "09172100904",
        [
            ("Luna", "Cat", "Persian", "Female", date(2023, 5, 8), "2 years old", "4.10", "Small",
             ["White", "Silver"], "Long silver-white coat, blue eyes, wears pastel bell collar", "Friendly", True,
             date(2026, 2, 18), date(2027, 2, 18), "Healthy, receives hairball control supplement",
             "Strictly indoor cat; loves sleeping by the living room window."),
            ("Simba", "Cat", "Bengal", "Male", date(2024, 2, 14), "2 years old", "5.00", "Medium",
             ["Orange", "Brown", "Spotted"], "Rosette leopard spots along flanks, striped tail tip", "Friendly", True,
             date(2026, 2, 18), date(2027, 2, 18), "Healthy, microchipped and vaccinated",
             "Very agile and playful; enjoys climbing cat trees."),
        ],
    ),
    (
        "Rafael Bautista", "rafael.bautista", "09172100105", "Block 2 Lot 1, Daisy Street",
        "14.80074000", "121.00330500", "Lorna Bautista", "09172100905",
        [
            ("Kobe", "Dog", "Golden Retriever", "Male", date(2022, 8, 22), "3 years old", "29.50", "Large",
             ["Golden", "Cream"], "Feathered cream chest fur, wears brown leather collar with QR tag", "Friendly", True,
             date(2026, 3, 14), date(2027, 3, 14), "Healthy, hip joint supplement daily",
             "Loves morning walks around Selera Community Park."),
        ],
    ),
    (
        "Camille Reyes", "camille.reyes", "09172100106", "Block 2 Lot 4, Daisy Street",
        "14.80079500", "121.00340200", "Noel Reyes", "09172100906",
        [
            ("Choco", "Dog", "Labrador Retriever", "Male", date(2021, 6, 30), "4 years old", "31.00", "Large",
             ["Chocolate", "Brown"], "Solid chocolate coat, small white star on chest", "Friendly", True,
             date(2026, 1, 25), date(2027, 1, 25), "Healthy, active swimmer and runner",
             "Very gentle with children; knows sit and stay commands."),
        ],
    ),
    (
        "Lorenzo Ramos", "lorenzo.ramos", "09172100107", "Block 2 Lot 8, Daisy Street",
        "14.80085200", "121.00349800", "Celia Ramos", "09172100907",
        [
            ("Tala", "Cat", "Siamese", "Female", date(2023, 9, 10), "2 years old", "3.60", "Small",
             ["Cream", "Chocolate"], "Seal point ears, mask, paws, and tail; bright blue eyes", "Anxious", True,
             date(2026, 5, 2), date(2027, 5, 2), "Healthy, 4-in-1 feline vaccine up to date",
             "Vocal with family members; hides from unfamiliar visitors."),
        ],
    ),
    (
        "Angelica Aquino", "angelica.aquino", "09172100108", "Block 2 Lot 11, Daisy Street",
        "14.80091000", "121.00359000", "Danilo Aquino", "09172100908",
        [
            ("Chibi", "Dog", "Pomeranian", "Female", date(2023, 12, 1), "2 years old", "3.10", "Small",
             ["Orange", "Cream"], "Fox-faced sable orange coat, plumed tail curled over back", "Friendly", False,
             date(2026, 2, 28), date(2027, 2, 28), "Healthy, dental chews thrice weekly",
             "Yappy when someone rings the doorbell but very affectionate."),
            ("Pandesal", "Dog", "Pug", "Male", date(2022, 10, 18), "3 years old", "8.40", "Small",
             ["Fawn", "Black"], "Fawn coat with black velvet mask and ears, double-curled tail", "Friendly", True,
             date(2026, 2, 28), date(2027, 2, 28), "Healthy, kept in air-conditioned room during midday heat",
             "Snores loudly and loves belly rubs."),
        ],
    ),
    (
        "Jericho Garcia", "jericho.garcia", "09172100109", "Block 3 Lot 3, Sampaguita Street",
        "14.80096500", "121.00368500", "Marites Garcia", "09172100909",
        [
            ("Brownie", "Dog", "Aspin (Asong Pinoy)", "Female", date(2022, 4, 19), "4 years old", "14.80", "Medium",
             ["Brown", "Tan"], "Light tan eyebrows and socks on all four paws", "Friendly", True,
             date(2026, 3, 22), date(2027, 3, 22), "Healthy, spayed during barangay vet mission",
             "Rescued as a puppy; very loyal and stays inside the yard."),
        ],
    ),
    (
        "Patricia Tolentino", "patricia.tolentino", "09172100110", "Block 3 Lot 6, Sampaguita Street",
        "14.80102000", "121.00378000", "Victor Tolentino", "09172100910",
        [
            ("Barley", "Dog", "Beagle", "Male", date(2023, 2, 25), "3 years old", "11.20", "Medium",
             ["Tricolor", "Brown", "White", "Black"], "Classic tricolor saddle, white-tipped tail, floppy brown ears", "Friendly", True,
             date(2026, 1, 15), date(2027, 1, 15), "Healthy, regular ear cleaning and tick preventative",
             "Follows scent trails in the garden; wears green reflective harness."),
        ],
    ),
    (
        "Enrique Navarro", "enrique.navarro", "09172100111", "Block 3 Lot 10, Sampaguita Street",
        "14.80107500", "121.00387500", "Gloria Navarro", "09172100911",
        [
            ("Loki", "Dog", "Siberian Husky", "Male", date(2022, 1, 9), "4 years old", "23.50", "Large",
             ["Gray", "White", "Black"], "Wolf-gray mask with white spectacles, bi-eyed (left blue, right brown)", "Friendly", True,
             date(2026, 4, 3), date(2027, 4, 3), "Healthy, double coat brushed daily",
             "Very vocal howler; walked early at 5:30 AM and 6:30 PM."),
        ],
    ),
    (
        "Beatriz Mercado", "beatriz.mercado", "09172100112", "Block 3 Lot 15, Sampaguita Street",
        "14.80113000", "121.00397000", "Fernando Mercado", "09172100912",
        [
            ("Siopao", "Cat", "British Shorthair", "Male", date(2023, 6, 11), "2 years old", "5.30", "Medium",
             ["Gray", "Blue"], "Plush dense blue-gray coat, chubby cheeks, copper-gold eyes", "Friendly", True,
             date(2026, 2, 9), date(2027, 2, 9), "Healthy, indoor cat on weight-management kibble",
             "Calm and laid-back; sits beside the study desk."),
            ("Kuting", "Cat", "Puspin (Pusang Pinoy)", "Female", date(2024, 5, 3), "1 year 6 months", "3.20", "Small",
             ["Tabby", "Gray", "White"], "Mackerel gray tabby stripes with white mittens and bib", "Friendly", True,
             date(2026, 2, 9), date(2027, 2, 9), "Healthy, spayed and vaccinated",
             "Playful companion to Siopao; chases feather wands."),
        ],
    ),
    (
        "Paolo Pascual", "paolo.pascual", "09172100113", "Block 4 Lot 2, Gumamela Street",
        "14.80118500", "121.00406500", "Rowena Pascual", "09172100913",
        [
            ("Buko", "Dog", "Pembroke Welsh Corgi", "Male", date(2023, 4, 1), "3 years old", "12.00", "Medium",
             ["Fawn", "White"], "Red-fawn coat with full white collar and white blaze on forehead", "Friendly", True,
             date(2026, 3, 18), date(2027, 3, 18), "Healthy, joint and coat omega oil supplement",
             "Short legs, big ears, very social with neighborhood joggers."),
        ],
    ),
    (
        "Danica Soriano", "danica.soriano", "09172100114", "Block 4 Lot 7, Gumamela Street",
        "14.80124000", "121.00416000", "Efren Soriano", "09172100914",
        [
            ("Nala", "Cat", "Ragdoll", "Female", date(2022, 12, 16), "3 years old", "4.60", "Medium",
             ["Cream", "Brown", "Bicolor"], "Inverted V white blaze on face, fluffy brown tail, ocean-blue eyes", "Friendly", True,
             date(2026, 1, 30), date(2027, 1, 30), "Healthy, indoor-only cat",
             "Goes limp when picked up; wears rose-gold breakaway collar."),
        ],
    ),
    (
        "Miguel Castillo", "miguel.castillo", "09172100115", "Block 4 Lot 11, Gumamela Street",
        "14.80129500", "121.00425500", "Carmela Castillo", "09172100915",
        [
            ("Milo", "Dog", "Jack Russell Terrier", "Male", date(2023, 8, 5), "2 years old", "6.80", "Small",
             ["White", "Tan"], "Smooth white coat with tan patches over both ears and base of tail", "Friendly", False,
             date(2026, 4, 15), date(2027, 4, 15), "Healthy, high energy, heartworm preventative monthly",
             "Loves catching tennis balls in the driveway."),
            ("Biscuit", "Dog", "Dachshund", "Female", date(2022, 9, 27), "3 years old", "7.10", "Small",
             ["Chestnut", "Red"], "Smooth red-chestnut coat, long body, dark tip on tail", "Friendly", True,
             date(2026, 4, 15), date(2027, 4, 15), "Healthy, uses ramp for sofa to protect spine",
             "Burrows under blankets; wears yellow harness on walks."),
        ],
    ),
    (
        "Katrina Salazar", "katrina.salazar", "09172100116", "Block 4 Lot 16, Gumamela Street",
        "14.80135000", "121.00285000", "Ruben Salazar", "09172100916",
        [
            ("Bella", "Dog", "Toy Poodle", "Female", date(2023, 3, 21), "3 years old", "3.90", "Small",
             ["Apricot", "Cream"], "Curly apricot coat in teddy-bear trim, white patch on chin", "Friendly", True,
             date(2026, 2, 14), date(2027, 2, 14), "Healthy, hypoallergenic coat groomed monthly",
             "Knows high-five and spin tricks."),
        ],
    ),
    (
        "Carlo Dizon", "carlo.dizon", "09172100117", "Block 5 Lot 1, Bougainvillea Street",
        "14.80140500", "121.00294500", "Estela Dizon", "09172100917",
        [
            ("Coco", "Dog", "French Bulldog", "Male", date(2022, 7, 14), "3 years old", "11.50", "Small",
             ["Brindle", "White"], "Dark brindle coat with white chest stripe, bat ears", "Friendly", True,
             date(2026, 3, 1), date(2027, 3, 1), "Healthy, skin folds cleaned regularly",
             "Friendly greeter; walks only in cool early mornings."),
        ],
    ),
    (
        "Bianca Morales", "bianca.morales", "09172100118", "Block 5 Lot 5, Bougainvillea Street",
        "14.80146000", "121.00304000", "Nestor Morales", "09172100918",
        [
            ("Ulap", "Cat", "Scottish Fold", "Male", date(2023, 10, 2), "2 years old", "4.40", "Small",
             ["White", "Silver"], "Folded ears, round owl-like face, snow-white plush coat", "Friendly", True,
             date(2026, 1, 19), date(2027, 1, 19), "Healthy, joint checkup cleared",
             "Sits in 'Buddha pose' on the living room rug."),
        ],
    ),
    (
        "Adrian Aguilar", "adrian.aguilar", "09172100119", "Block 5 Lot 9, Bougainvillea Street",
        "14.80151500", "121.00313500", "Melinda Aguilar", "09172100919",
        [
            ("Kidlat", "Dog", "Belgian Malinois", "Male", date(2021, 5, 17), "4 years old", "27.80", "Large",
             ["Fawn", "Black"], "Mahogany fawn with black mask and black ears, athletic build", "Protective", True,
             date(2026, 2, 22), date(2027, 2, 22), "Healthy, obedience-trained working dog",
             "Kept inside secure high-fenced yard; walked on padded leash."),
            ("Tisay", "Dog", "Aspin (Asong Pinoy)", "Female", date(2023, 1, 29), "3 years old", "13.40", "Medium",
             ["Cream", "White"], "Cream coat with freckles on snout and pink nose", "Friendly", True,
             date(2026, 2, 22), date(2027, 2, 22), "Healthy, spayed and vaccinated",
             "Sweet temperament; grew up alongside Kidlat."),
        ],
    ),
    (
        "Valerie Velasco", "valerie.velasco", "09172100120", "Block 5 Lot 12, Bougainvillea Street",
        "14.80157000", "121.00323000", "Oscar Velasco", "09172100920",
        [
            ("Sinta", "Cat", "Puspin (Pusang Pinoy)", "Female", date(2022, 11, 11), "3 years old", "3.50", "Small",
             ["Tortoiseshell", "Black", "Orange"], "Tortoiseshell mottled black and ginger coat, bobbed tail", "Friendly", True,
             date(2026, 3, 29), date(2027, 3, 29), "Healthy, spayed and anti-rabies vaccinated",
             "Affectionate lap cat; wears purple breakaway collar with tag."),
        ],
    ),
    (
        "Marco Miranda", "marco.miranda", "09172100121", "Block 6 Lot 2, Ilang-Ilang Street",
        "14.80162500", "121.00332500", "Lydia Miranda", "09172100921",
        [
            ("Putot", "Dog", "Aspin (Asong Pinoy)", "Male", date(2020, 8, 14), "5 years old", "15.60", "Medium",
             ["Tan", "White"], "Natural short bobtail, white blaze down the nose", "Friendly", True,
             date(2026, 1, 11), date(2027, 1, 11), "Healthy senior checkup passed",
             "Well-known friendly dog on Ilang-Ilang Street."),
        ],
    ),
    (
        "Charmaine Flores", "charmaine.flores", "09172100122", "Block 6 Lot 6, Ilang-Ilang Street",
        "14.80168000", "121.00342000", "Ronaldo Flores", "09172100922",
        [
            ("Oreo", "Dog", "Shih Tzu", "Male", date(2023, 5, 23), "2 years old", "5.80", "Small",
             ["Bicolor", "Black", "White"], "Black ears and mask with white body and black tail base", "Friendly", True,
             date(2026, 4, 8), date(2027, 4, 8), "Healthy, puppy cut trim",
             "Carries his plush squeaky toy everywhere."),
            ("Matcha", "Cat", "American Shorthair", "Female", date(2024, 1, 17), "2 years old", "3.90", "Small",
             ["Silver", "Tabby"], "Classic silver swirl tabby pattern with emerald-green eyes", "Friendly", True,
             date(2026, 4, 8), date(2027, 4, 8), "Healthy, indoor cat",
             "Gets along well with Oreo."),
        ],
    ),
    (
        "Nathaniel Castro", "nathaniel.castro", "09172100123", "Block 6 Lot 10, Ilang-Ilang Street",
        "14.80173500", "121.00351500", "Imelda Castro", "09172100923",
        [
            ("Tisoy", "Dog", "Chihuahua", "Male", date(2022, 2, 10), "4 years old", "2.70", "Small",
             ["Cream", "Fawn"], "Apple-head cream Chihuahua with large erect ears, red collar", "Anxious", True,
             date(2026, 2, 5), date(2027, 2, 5), "Healthy, warm sweater worn on rainy days",
             "Timid around strangers; prefers being carried by owner."),
        ],
    ),
    (
        "Erika Pangilinan", "erika.pangilinan", "09172100124", "Block 6 Lot 14, Ilang-Ilang Street",
        "14.80179000", "121.00361000", "Gregorio Pangilinan", "09172100924",
        [
            ("Mingming", "Cat", "Puspin (Pusang Pinoy)", "Female", date(2023, 3, 9), "3 years old", "3.40", "Small",
             ["Orange", "White"], "Ginger tabby back with white belly and four white paws", "Friendly", True,
             date(2026, 3, 12), date(2027, 3, 12), "Healthy, spayed and dewormed",
             "Sunbathes on the carport hood every morning."),
        ],
    ),
    (
        "Dominic De Guzman", "dominic.deguzman", "09172100125", "Block 7 Lot 3, Kalachuchi Street",
        "14.80184500", "121.00370500", "Milagros De Guzman", "09172100925",
        [
            ("Rocky", "Dog", "German Shepherd", "Male", date(2021, 9, 3), "4 years old", "34.00", "Large",
             ["Black", "Tan"], "Black saddle and mask with rich tan legs, microchipped", "Protective", True,
             date(2026, 1, 28), date(2027, 1, 28), "Healthy, regular vet checkups at Santa Maria Vet Clinic",
             "Trained family guardian; always walked on double-clip harness."),
        ],
    ),
    (
        "Alyssa Vergara", "alyssa.vergara", "09172100126", "Block 7 Lot 7, Kalachuchi Street",
        "14.80190000", "121.00380000", "Reynaldo Vergara", "09172100926",
        [
            ("Peanut", "Dog", "Miniature Pinscher", "Female", date(2023, 7, 1), "2 years old", "4.10", "Small",
             ["Black", "Rust"], "Sleek black coat with rust markings above eyes and on chest", "Friendly", True,
             date(2026, 4, 19), date(2027, 4, 19), "Healthy, high-stepping hackney gait",
             "Energetic and curious; wears pink leather collar with QR tag."),
            ("Toffee", "Dog", "Cocker Spaniel", "Male", date(2022, 6, 12), "3 years old", "13.20", "Medium",
             ["Golden", "Honey"], "Long wavy honey-gold ears and feathered legs", "Friendly", True,
             date(2026, 4, 19), date(2027, 4, 19), "Healthy, ears dried after baths",
             "Very gentle and loves greeting neighbors."),
        ],
    ),
    (
        "Christian Manalo", "christian.manalo", "09172100127", "Block 7 Lot 11, Kalachuchi Street",
        "14.80195500", "121.00389500", "Sonia Manalo", "09172100927",
        [
            ("Chai", "Cat", "Himalayan", "Female", date(2022, 10, 25), "3 years old", "4.00", "Small",
             ["Cream", "Chocolate"], "Long cream coat with chocolate points and sapphire-blue eyes", "Friendly", True,
             date(2026, 2, 16), date(2027, 2, 16), "Healthy, brushed daily to prevent mats",
             "Quiet indoor cat; enjoys soft fleece beds."),
        ],
    ),
    (
        "Janine Pineda", "janine.pineda", "09172100128", "Block 7 Lot 15, Kalachuchi Street",
        "14.80201000", "121.00399000", "Armando Pineda", "09172100928",
        [
            ("Pepper", "Dog", "Schnauzer", "Female", date(2023, 2, 4), "3 years old", "7.60", "Small",
             ["Salt and Pepper", "Gray", "Silver"], "Bushy white eyebrows and beard, salt-and-pepper wiry coat", "Friendly", True,
             date(2026, 3, 8), date(2027, 3, 8), "Healthy, low-fat diet",
             "Alert and expressive; barks once when parcels arrive."),
        ],
    ),
    (
        "Julius Alcaraz", "julius.alcaraz", "09172100129", "Block 8 Lot 2, Orchid Street",
        "14.80206500", "121.00408500", "Delia Alcaraz", "09172100929",
        [
            ("Shadow", "Cat", "Russian Blue", "Male", date(2022, 5, 30), "3 years old", "4.80", "Medium",
             ["Gray", "Silver"], "Shimmering slate-gray double coat, vivid green eyes", "Anxious", True,
             date(2026, 1, 22), date(2027, 1, 22), "Healthy, annual booster complete",
             "Bonds closely with owner; shy around guests."),
        ],
    ),
    (
        "Rochelle Concepcion", "rochelle.concepcion", "09172100130", "Block 8 Lot 6, Orchid Street",
        "14.80212000", "121.00418000", "Edgardo Concepcion", "09172100930",
        [
            ("Ginger", "Cat", "Maine Coon", "Female", date(2021, 12, 19), "4 years old", "6.40", "Large",
             ["Ginger", "Orange", "White"], "Lynx-tipped ears, bushy Maine Coon tail, white ruff", "Friendly", True,
             date(2026, 4, 1), date(2027, 4, 1), "Healthy, large frame, regular grooming",
             "Chirps and trills instead of meowing; loves water fountains."),
            ("Cloud", "Dog", "Chow Chow", "Male", date(2022, 8, 8), "3 years old", "24.00", "Large",
             ["Cream", "White"], "Lion-like cream mane, blue-black tongue, deep-set eyes", "Protective", True,
             date(2026, 4, 1), date(2027, 4, 1), "Healthy, kept indoors in cool room",
             "Aloof with strangers but calm and house-trained."),
        ],
    ),
    (
        "Xavier Magbanua", "xavier.magbanua", "09172100131", "Block 8 Lot 9, Orchid Street",
        "14.79982000", "121.00274000", "Evelyn Magbanua", "09172100931",
        [
            ("Hachi", "Dog", "Aspin (Asong Pinoy)", "Male", date(2022, 1, 18), "4 years old", "17.20", "Medium",
             ["Golden", "Tan"], "Reddish-tan coat, curled sickle tail, black muzzle", "Friendly", True,
             date(2026, 2, 11), date(2027, 2, 11), "Healthy, vaccinated at subdivision pet drive",
             "Waits by the gate at 5 PM for owner's car."),
        ],
    ),
    (
        "Denise Sarmiento", "denise.sarmiento", "09172100132", "Block 8 Lot 13, Orchid Street",
        "14.79988000", "121.00283500", "Wilfredo Sarmiento", "09172100932",
        [
            ("Lola", "Dog", "Pug", "Female", date(2021, 4, 2), "5 years old", "7.90", "Small",
             ["Silver", "Black"], "Silver-fawn body with black velvet face mask and mole on cheek", "Friendly", True,
             date(2026, 3, 17), date(2027, 3, 17), "Healthy, eye drops used for lubrication",
             "Sweet senior pug; loves short evening strolls."),
        ],
    ),
    (
        "Harold Evangelista", "harold.evangelista", "09172100133", "Block 9 Lot 1, Jasmin Street",
        "14.79994000", "121.00293000", "Corazon Evangelista", "09172100933",
        [
            ("Bambi", "Dog", "Aspin (Asong Pinoy)", "Female", date(2023, 6, 25), "2 years old", "12.60", "Medium",
             ["Fawn", "White"], "Slender deer-like build, white socks and white chest blaze", "Scared", True,
             date(2026, 1, 14), date(2027, 1, 14), "Healthy, spayed and microchipped",
             "Startled by thunder and fireworks; wears calming vest in storms."),
        ],
    ),
    (
        "Sheila Macapagal", "sheila.macapagal", "09172100134", "Block 9 Lot 5, Jasmin Street",
        "14.80000500", "121.00302500", "Leopoldo Macapagal", "09172100934",
        [
            ("Yuki", "Cat", "Persian", "Male", date(2023, 11, 14), "2 years old", "4.30", "Small",
             ["White"], "Pure white coat, odd-eyed (one blue, one amber), teal collar", "Friendly", True,
             date(2026, 4, 21), date(2027, 4, 21), "Healthy, normal hearing verified by vet",
             "Loves sitting on the cushioned bay window."),
            ("Tofu", "Cat", "Puspin (Pusang Pinoy)", "Male", date(2024, 3, 8), "2 years old", "3.90", "Small",
             ["White", "Cream"], "Cream-white coat with light orange rings on tail", "Friendly", True,
             date(2026, 4, 21), date(2027, 4, 21), "Healthy, neutered and vaccinated",
             "Best friends with Yuki; greets visitors at the door."),
        ],
    ),
    (
        "Tristan Galang", "tristan.galang", "09172100135", "Block 9 Lot 8, Jasmin Street",
        "14.80006500", "121.00312000", "Zenaida Galang", "09172100935",
        [
            ("Kiko", "Dog", "Beagle", "Male", date(2022, 3, 29), "4 years old", "12.40", "Medium",
             ["Tricolor", "Brown", "Black", "White"], "Freckled white muzzle, dark brown ears, white tip on tail", "Friendly", True,
             date(2026, 2, 3), date(2027, 2, 3), "Healthy, up to date on 5-in-1 and anti-rabies",
             "Friendly with other dogs at Selera Community Park."),
        ],
    ),
    (
        "Kyla Dimaculangan", "kyla.dimaculangan", "09172100136", "Block 9 Lot 12, Jasmin Street",
        "14.80012500", "121.00321500", "Rodolfo Dimaculangan", "09172100936",
        [
            ("Pochi", "Dog", "Pomeranian", "Male", date(2023, 8, 19), "2 years old", "2.90", "Small",
             ["Cream", "Sable"], "Fluffy cream-sable coat, teddy bear haircut, sky-blue harness", "Friendly", False,
             date(2026, 3, 25), date(2027, 3, 25), "Healthy, patella check clear",
             "Spins in circles when excited for treats."),
        ],
    ),
    (
        "Renzo Ilagan", "renzo.ilagan", "09172100137", "Block 10 Lot 2, Camia Street",
        "14.80018500", "121.00331000", "Perlita Ilagan", "09172100937",
        [
            ("Saki", "Cat", "Siamese", "Female", date(2022, 7, 7), "3 years old", "3.50", "Small",
             ["Cream", "Brown"], "Lilac-brown point markings on ears and paws, kinked tail tip", "Friendly", True,
             date(2026, 1, 17), date(2027, 1, 17), "Healthy, spayed and indoor-kept",
             "Chatty in the morning at breakfast time."),
        ],
    ),
    (
        "Faye Soliman", "faye.soliman", "09172100138", "Block 10 Lot 6, Camia Street",
        "14.80024500", "121.00340500", "Aurelio Soliman", "09172100938",
        [
            ("Ducky", "Dog", "Golden Retriever", "Female", date(2023, 1, 5), "3 years old", "26.50", "Large",
             ["Golden"], "Light golden wavy coat, carries yellow rubber duck toy, red collar", "Friendly", True,
             date(2026, 2, 27), date(2027, 2, 27), "Healthy, annual heartworm and rabies shots complete",
             "Super gentle family dog; loves fetching in the backyard."),
            ("Mimi", "Cat", "Puspin (Pusang Pinoy)", "Female", date(2023, 9, 22), "2 years old", "3.30", "Small",
             ["Tuxedo", "Black", "White"], "Black tuxedo coat with white chin, chest, and four white boots", "Friendly", True,
             date(2026, 2, 27), date(2027, 2, 27), "Healthy, spayed",
             "Naps curled up next to Ducky."),
        ],
    ),
    (
        "Aldrin Lazaro", "aldrin.lazaro", "09172100139", "Block 10 Lot 10, Camia Street",
        "14.80030500", "121.00350000", "Nora Lazaro", "09172100939",
        [
            ("Haru", "Dog", "Shih Tzu", "Male", date(2022, 11, 30), "3 years old", "6.00", "Small",
             ["Tricolor", "Brown", "White", "Black"], "Brown and white coat with black-tipped ears, underbite grin", "Friendly", True,
             date(2026, 4, 10), date(2027, 4, 10), "Healthy, groomed every month",
             "Very calm during bath and blow-dry."),
        ],
    ),
    (
        "Monica Espiritu", "monica.espiritu", "09172100140", "Block 10 Lot 14, Camia Street",
        "14.80036500", "121.00359500", "Rogelio Espiritu", "09172100940",
        [
            ("Bibo", "Dog", "Aspin (Asong Pinoy)", "Male", date(2023, 4, 14), "3 years old", "15.00", "Medium",
             ["Black", "Tan"], "Black coat with tan eyebrows (dobie markings) and white chest spot", "Friendly", True,
             date(2026, 3, 6), date(2027, 3, 6), "Healthy, neutered and vaccinated",
             "Knows handshake and sit; wears orange reflective collar."),
        ],
    ),
    (
        "Cedric Malabanan", "cedric.malabanan", "09172100141", "Block 11 Lot 1, Santan Street",
        "14.80042500", "121.00369000", "Leticia Malabanan", "09172100941",
        [
            ("Pancho", "Dog", "French Bulldog", "Male", date(2022, 6, 3), "3 years old", "12.20", "Small",
             ["Fawn", "Black"], "Pied fawn coat with black mask, compact muscular build", "Friendly", True,
             date(2026, 1, 29), date(2027, 1, 29), "Healthy, sensitive stomach salmon kibble",
             "Loves rolling on the cool living room tiles."),
        ],
    ),
    (
        "Hannah Tupas", "hannah.tupas", "09172100142", "Block 11 Lot 4, Santan Street",
        "14.80048500", "121.00378500", "Virgilio Tupas", "09172100942",
        [
            ("Kaloy", "Cat", "Puspin (Pusang Pinoy)", "Male", date(2022, 2, 21), "4 years old", "4.50", "Medium",
             ["Ginger", "Orange"], "Classic marmalade orange tabby with ringed tail and freckled nose", "Friendly", True,
             date(2026, 2, 19), date(2027, 2, 19), "Healthy, neutered indoor-outdoor cat",
             "Very affectionate; comes running when called."),
            ("Trixie", "Dog", "Toy Poodle", "Female", date(2023, 10, 15), "2 years old", "3.50", "Small",
             ["Chocolate", "Brown"], "Rich chocolate curls, wears red polka-dot bow collar", "Friendly", True,
             date(2026, 2, 19), date(2027, 2, 19), "Healthy, up to date on vaccinations",
             "Playful and alert; sleeps at the foot of the bed."),
        ],
    ),
    (
        "Bryan Legaspi", "bryan.legaspi", "09172100143", "Block 11 Lot 8, Santan Street",
        "14.80054500", "121.00388000", "Conchita Legaspi", "09172100943",
        [
            ("Max", "Dog", "Labrador Retriever", "Male", date(2021, 7, 12), "4 years old", "30.20", "Large",
             ["Yellow", "Cream"], "Yellow Lab coat with slightly darker biscuit ears, navy collar", "Friendly", True,
             date(2026, 3, 30), date(2027, 3, 30), "Healthy, annual wellness exam complete",
             "Retrieves newspapers and slippers without chewing them."),
        ],
    ),
    (
        "Celine Custodio", "celine.custodio", "09172100144", "Block 11 Lot 12, Santan Street",
        "14.80060500", "121.00397500", "Renato Custodio", "09172100944",
        [
            ("Daisy", "Dog", "Dachshund", "Female", date(2023, 5, 16), "2 years old", "6.50", "Small",
             ["Black", "Tan"], "Smooth black and tan coat, long floppy ears, green collar", "Friendly", True,
             date(2026, 4, 5), date(2027, 4, 5), "Healthy, ideal weight maintained",
             "Loves sniffing around flowerpots on the patio."),
        ],
    ),
    (
        "Vincent Abad", "vincent.abad", "09172100145", "Block 12 Lot 2, Dahlia Street",
        "14.80066500", "121.00407000", "Norma Abad", "09172100945",
        [
            ("Charlie", "Dog", "Pembroke Welsh Corgi", "Male", date(2022, 9, 9), "3 years old", "11.80", "Medium",
             ["Tricolor", "Black", "Tan", "White"], "Black-headed tricolor Corgi with white ruff and tan cheeks", "Friendly", True,
             date(2026, 1, 24), date(2027, 1, 24), "Healthy, brushed thrice weekly",
             "Sploot sleeper; very popular at subdivision events."),
            ("Goldie", "Dog", "Golden Retriever", "Female", date(2023, 8, 12), "2 years old", "25.40", "Large",
             ["Golden", "Cream"], "Warm golden coat with cream feathering on tail, teal collar", "Friendly", True,
             date(2026, 1, 24), date(2027, 1, 24), "Healthy, spayed and vaccinated",
             "Gentle companion to Charlie; loves morning walks."),
        ],
    ),
    (
        "Joyce Samonte", "joyce.samonte", "09172100146", "Block 12 Lot 5, Dahlia Street",
        "14.80072500", "121.00416500", "Fidel Samonte", "09172100946",
        [
            ("Lucy", "Cat", "British Shorthair", "Female", date(2023, 3, 3), "3 years old", "4.70", "Medium",
             ["Cream", "White"], "Cream-and-white bi-color plush coat, round amber eyes", "Friendly", True,
             date(2026, 2, 12), date(2027, 2, 12), "Healthy, indoor cat",
             "Quiet and polite; loves freeze-dried chicken treats."),
            ("Chubs", "Cat", "Puspin (Pusang Pinoy)", "Male", date(2022, 8, 28), "3 years old", "5.10", "Medium",
             ["Gray", "White"], "Chunky gray-and-white tuxedo cat with a gray goatee spot on chin", "Friendly", True,
             date(2026, 2, 12), date(2027, 2, 12), "Healthy, neutered",
             "Very chill cat; loves belly scratches."),
        ],
    ),
    (
        "Kenneth Valerio", "kenneth.valerio", "09172100147", "Block 12 Lot 9, Dahlia Street",
        "14.80078500", "121.00426000", "Soledad Valerio", "09172100947",
        [
            ("Bailey", "Dog", "Aspin (Asong Pinoy)", "Female", date(2022, 12, 5), "3 years old", "14.20", "Medium",
             ["Brindle", "White"], "Tiger-brindle coat with white chest and front paws", "Friendly", True,
             date(2026, 3, 19), date(2027, 3, 19), "Healthy, spayed and vaccinated",
             "Gentle and obedient; walks nicely on a loose leash."),
        ],
    ),
    (
        "Abigail Roxas", "abigail.roxas", "09172100148", "Block 12 Lot 13, Dahlia Street",
        "14.80084500", "121.00435500", "Teodoro Roxas", "09172100948",
        [
            ("Cooper", "Dog", "Jack Russell Terrier", "Male", date(2023, 6, 17), "2 years old", "7.00", "Small",
             ["White", "Brown"], "Broken-coated white terrier with chestnut eye patch and tail spot", "Friendly", True,
             date(2026, 4, 11), date(2027, 4, 11), "Healthy, agility-trained",
             "Jumps high for frisbees; always wears QR tag collar."),
        ],
    ),
    (
        "Daryl Enriquez", "daryl.enriquez", "09172100149", "Block 13 Lot 3, Molave Street",
        "14.80090500", "121.00445000", "Luzviminda Enriquez", "09172100949",
        [
            ("Sadie", "Dog", "Siberian Husky", "Female", date(2022, 4, 24), "4 years old", "21.00", "Large",
             ["Red", "White"], "Copper-red and white coat, amber eyes, pink snow nose", "Friendly", True,
             date(2026, 2, 7), date(2027, 2, 7), "Healthy, regular coat deshedding",
             "Friendly and playful; loves ice cubes after walks."),
        ],
    ),
    (
        "Nadine Villamor", "nadine.villamor", "09172100150", "Block 13 Lot 7, Molave Street",
        "14.80096500", "121.00454500", "Hernando Villamor", "09172100950",
        [
            ("Molly", "Cat", "Scottish Fold", "Female", date(2023, 4, 11), "3 years old", "3.80", "Small",
             ["Calico", "White", "Orange", "Black"], "Folded ears, dilute calico patches on back and tail", "Friendly", True,
             date(2026, 3, 15), date(2027, 3, 15), "Healthy, indoor cat",
             "Purrs loudly as soon as someone enters the room."),
            ("Pogi", "Dog", "Aspin (Asong Pinoy)", "Male", date(2021, 10, 10), "4 years old", "16.00", "Medium",
             ["Black", "White"], "Glossy black coat with white tuxedo chest and white tail tip", "Friendly", True,
             date(2026, 3, 15), date(2027, 3, 15), "Healthy, neutered and anti-rabies vaccinated",
             "Friendly house guardian who gets along with Molly."),
        ],
    ),
]


def _load_photo_manifest() -> Dict[str, Dict[str, Any]]:
    """
    Load the dedicated 65-pet Cloudinary photo manifest (`demo_pet_photos_manifest.json`).
    Never reuses personal user-uploaded photos from existing database records.
    """
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
    return {}


def _photo_for_demo_pet(manifest: Dict[str, Dict[str, Any]], email_local: str, pet_name: str, pet_index: int) -> Tuple[str, Optional[float]]:
    key = f"{email_local}:{pet_name}"
    entry = manifest.get(key)
    if entry and isinstance(entry.get("photo_url"), str) and entry["photo_url"].startswith("https://"):
        conf = entry.get("yolo_confidence")
        return entry["photo_url"], float(conf) if isinstance(conf, (int, float)) else None
    cloud_name = (os.getenv("CLOUDINARY_CLOUD_NAME") or "").strip() or "demo"
    slug = f"{email_local}_{pet_name}".lower().replace(" ", "_").replace(".", "_")
    return f"https://res.cloudinary.com/{cloud_name}/image/upload/v1/straysafe/demo_pets/demo_pet_{pet_index:02d}_{slug}.jpg", None


def _ensure_selera_homes(db: Session) -> Subdivision:
    """Resolve Selera Homes subdivision (or create minimum role/barangay/subdivision if running on an empty DB)."""
    role = db.query(Role).filter(Role.role_id == 1).first()
    if not role:
        db.add(Role(role_id=1, role_name="Citizen"))
        db.flush()

    selera = (
        db.query(Subdivision)
        .filter(Subdivision.subdivision_name.ilike("%Selera%"))
        .order_by(Subdivision.subdivision_id.asc())
        .first()
    )
    if selera is not None:
        return selera

    first_sub = db.query(Subdivision).order_by(Subdivision.subdivision_id.asc()).first()
    if first_sub is not None:
        return first_sub

    brgy = db.query(Barangay).order_by(Barangay.barangay_id.asc()).first()
    if brgy is None:
        brgy = Barangay(barangay_name="San Vicente", city="Santa Maria, Bulacan")
        db.add(brgy)
        db.flush()

    selera = Subdivision(barangay_id=brgy.barangay_id, subdivision_name="Selera Homes")
    db.add(selera)
    db.flush()
    return selera


def seed_demo_residents_and_pets(db: Session) -> Dict[str, Any]:
    """
    Idempotently seed 50 Selera Homes resident accounts and their registered pets (65 pets total),
    each with an active PetTag QR code.
    Returns summary statistics of created vs existing records.
    """
    assert len(RESIDENT_SEED_DATA) == 50, f"Expected 50 resident definitions, found {len(RESIDENT_SEED_DATA)}"
    enforce_password_policy(DEMO_PASSWORD_PLAIN)
    password_hash = get_password_hash(DEMO_PASSWORD_PLAIN)

    selera = _ensure_selera_homes(db)
    manifest = _load_photo_manifest()
    pet_counter = 0

    residents_created = 0
    residents_existing = 0
    pets_created = 0
    pets_existing = 0
    tags_ensured = 0

    seeded_user_ids: List[int] = []
    seeded_pet_ids: List[int] = []

    for (
        full_name,
        email_local,
        raw_phone,
        address,
        lat_str,
        lng_str,
        emerg_name,
        raw_emerg_phone,
        pet_defs,
    ) in RESIDENT_SEED_DATA:
        email = f"{email_local}@{DEMO_EMAIL_DOMAIN}"
        phone = normalize_ph_phone(raw_phone, required=True, mobile_only=True)
        emerg_phone = normalize_ph_phone(raw_emerg_phone, required=True, mobile_only=True)
        lat = Decimal(lat_str)
        lng = Decimal(lng_str)

        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(
                name=full_name,
                email=email,
                password=password_hash,
                phone=phone,
                role_id=1,
                subdivision_id=selera.subdivision_id,
                barangay_id=selera.barangay_id,
                is_head_officer=False,
                address=address,
                latitude=lat,
                longitude=lng,
                status="Active",
                is_verified=True,
            )
            db.add(user)
            db.flush()
            residents_created += 1
        else:
            residents_existing += 1

        seeded_user_ids.append(user.user_id)

        # Ensure notification preferences row exists
        pref = (
            db.query(UserNotificationPreference)
            .filter(UserNotificationPreference.user_id == user.user_id)
            .first()
        )
        if pref is None:
            db.add(UserNotificationPreference(user_id=user.user_id))
            db.flush()

        for (
            pet_name,
            pet_type,
            breed,
            gender,
            birth_dt,
            est_age,
            weight_str,
            size_cat,
            colors_list,
            markings,
            temperament,
            is_neutered,
            vax_date,
            vax_expiry,
            health_cond,
            notes,
        ) in pet_defs:
            pet_counter += 1
            chosen_photo, yolo_conf = _photo_for_demo_pet(manifest, email_local, pet_name, pet_counter)
            manifest_entry = manifest.get(f"{email_local}:{pet_name}") or {}
            effective_colors = manifest_entry.get("colors") or list(colors_list)

            pet = (
                db.query(Pet)
                .filter(
                    Pet.owner_id == user.user_id,
                    Pet.pet_name == pet_name,
                    Pet.pet_type == pet_type,
                )
                .first()
            )
            if pet is None:
                color_payload: Dict[str, Any] = {"colors": list(effective_colors)}
                apply_pet_color_payload(color_payload)

                pet = Pet(
                    owner_id=user.user_id,
                    pet_name=pet_name,
                    pet_type=pet_type,
                    breed=breed,
                    colors=color_payload.get("colors"),
                    color_markings=color_payload.get("color_markings"),
                    primary_color=color_payload.get("primary_color"),
                    secondary_color=color_payload.get("secondary_color"),
                    tertiary_color=color_payload.get("tertiary_color"),
                    gender=gender,
                    birth_date=birth_dt,
                    estimated_age=est_age,
                    weight=Decimal(weight_str),
                    size_category=size_cat,
                    photo_url=chosen_photo,
                    ai_detection_confidence=yolo_conf,
                    health_condition=health_cond,
                    is_vaccinated=True,
                    vaccination_date=vax_date,
                    vaccine_expiry=vax_expiry,
                    is_neutered=is_neutered,
                    temperament=temperament,
                    has_bite_history=False,
                    bite_incident_count=0,
                    chase_behavior=False,
                    chase_incident_count=0,
                    declared_bite_history=False,
                    declared_chase_behavior=False,
                    notes=notes,
                    status="Active",
                    is_verified=True,
                    emergency_contact_name=emerg_name,
                    emergency_contact_phone=emerg_phone,
                    distinctive_markings=markings,
                    registered_address=user.address,
                    registered_latitude=user.latitude,
                    registered_longitude=user.longitude,
                    registered_by_user_id=user.user_id,
                    registered_by_name=user.name,
                    photo_check_status="authentic",
                )
                db.add(pet)
                db.flush()
                pets_created += 1
            else:
                if pet.photo_url != chosen_photo:
                    pet.photo_url = chosen_photo
                if yolo_conf is not None:
                    pet.ai_detection_confidence = yolo_conf
                pets_existing += 1

            seeded_pet_ids.append(pet.pet_id)

            tag: Optional[PetTag] = pet_tag_service.ensure_active_tag(db, pet, user.user_id)
            if tag is not None:
                tags_ensured += 1

    db.commit()

    # Ensure confirmed realistic subdivision pet policies are seeded
    try:
        from seed_subdivision_policies import seed_policies
        seed_policies(selera.subdivision_id)
    except Exception as e:
        print(f"[WARN] Could not seed subdivision policies: {e}")

    return {
        "subdivision_id": selera.subdivision_id,
        "subdivision_name": selera.subdivision_name,
        "total_demo_residents": len(seeded_user_ids),
        "residents_created": residents_created,
        "residents_existing": residents_existing,
        "total_demo_pets": len(seeded_pet_ids),
        "pets_created": pets_created,
        "pets_existing": pets_existing,
        "tags_ensured": tags_ensured,
        "seeded_user_ids": seeded_user_ids,
        "seeded_pet_ids": seeded_pet_ids,
    }


def main() -> None:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        summary = seed_demo_residents_and_pets(db)
        print(
            f"[SEED COMPLETE] Subdivision: {summary['subdivision_name']} (#{summary['subdivision_id']})\n"
            f"  Demo Residents : {summary['total_demo_residents']} total "
            f"({summary['residents_created']} created, {summary['residents_existing']} already existed)\n"
            f"  Registered Pets: {summary['total_demo_pets']} total "
            f"({summary['pets_created']} created, {summary['pets_existing']} already existed)\n"
            f"  Active QR Tags : {summary['tags_ensured']} ensured"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
