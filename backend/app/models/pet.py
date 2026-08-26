from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Pet(Base):
    __tablename__ = "pets"

    pet_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )
    pet_name: Mapped[str] = mapped_column(String(100), nullable=False)
    pet_type: Mapped[str] = mapped_column(Enum("Dog", "Cat", name="pet_type"), nullable=False)
    breed: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    color_markings: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(
        Enum("Male", "Female", "Unknown", name="pet_gender"), default="Unknown"
    )
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    estimated_age: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    size_category: Mapped[Optional[str]] = mapped_column(
        Enum("Small", "Medium", "Large", name="size_category"), default="Medium"
    )
    photo_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    photo_front_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    photo_left_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    photo_right_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    health_condition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_vaccinated: Mapped[bool] = mapped_column(Boolean, default=False)
    vaccination_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    vaccine_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_neutered: Mapped[bool] = mapped_column(Boolean, default=False)
    vaccine_card_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    temperament: Mapped[Optional[str]] = mapped_column(
        Enum("Friendly", "Aggressive", "Anxious", "Scared", "Protective", name="temperament"),
        default="Friendly",
    )
    has_bite_history: Mapped[bool] = mapped_column(Boolean, default=False)
    bite_incident_count: Mapped[int] = mapped_column(Integer, default=0)
    chase_behavior: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[Optional[str]] = mapped_column(
        Enum("Active", "Lost", "Found", "Rescued", "Deceased", name="pet_status"), default="Active"
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8), nullable=True)
    last_seen_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8), nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    primary_color: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    secondary_color: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tertiary_color: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    distinctive_markings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    registered_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    registered_latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8), nullable=True)
    registered_longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8), nullable=True)

    registered_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )
    registered_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    owner = relationship("User", foreign_keys=[owner_id])
    registered_by = relationship("User", foreign_keys=[registered_by_user_id])
    vaccinations = relationship("PetVaccination", back_populates="pet", cascade="all, delete-orphan")


class PetVaccination(Base):
    __tablename__ = "pet_vaccinations"

    vaccination_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pet_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False
    )
    vaccine_name: Mapped[str] = mapped_column(String(100), nullable=False)
    administered_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    clinic_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    veterinarian: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    pet = relationship("Pet", back_populates="vaccinations")
