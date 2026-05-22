from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Enum, Numeric, Text, func
from app.database import Base
from sqlalchemy.orm import relationship

class Pet(Base):
    __tablename__ = "pets"

    pet_id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    pet_name = Column(String(100), nullable=False)
    pet_type = Column(Enum('Dog', 'Cat', name='pet_type'), nullable=False)
    breed = Column(String(100), nullable=True)
    color_markings = Column(String(255), nullable=True)
    gender = Column(Enum('Male', 'Female', 'Unknown', name='pet_gender'), default='Unknown')
    birth_date = Column(Date, nullable=True)
    estimated_age = Column(String(50), nullable=True)
    weight = Column(Numeric(5, 2), nullable=True)
    size_category = Column(Enum('Small', 'Medium', 'Large', name='size_category'), default='Medium')
    photo_url = Column(String(255), nullable=True)
    
    # Health
    health_condition = Column(Text, nullable=True)
    is_vaccinated = Column(Boolean, default=False)
    vaccination_date = Column(Date, nullable=True)
    vaccine_expiry = Column(Date, nullable=True)
    is_neutered = Column(Boolean, default=False)
    
    # Behavior
    temperament = Column(Enum('Friendly', 'Aggressive', 'Anxious', 'Scared', 'Protective', name='temperament'), default='Friendly')
    has_bite_history = Column(Boolean, default=False)
    bite_incident_count = Column(Integer, default=0)
    chase_behavior = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    
    # Tracking
    status = Column(Enum('Active', 'Lost', 'Found', 'Rescued', 'Deceased', name='pet_status'), default='Active')
    is_verified = Column(Boolean, default=False)
    last_seen_lat = Column(Numeric(10, 8), nullable=True)
    last_seen_lng = Column(Numeric(11, 8), nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    
    emergency_contact_name = Column(String(100), nullable=True)
    emergency_contact_phone = Column(String(20), nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    owner = relationship("User")
    vaccinations = relationship("PetVaccination", back_populates="pet", cascade="all, delete-orphan")

class PetVaccination(Base):
    __tablename__ = "pet_vaccinations"

    vaccination_id = Column(Integer, primary_key=True, index=True)
    pet_id = Column(Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False)
    vaccine_name = Column(String(100), nullable=False)
    vaccination_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=True)
    veterinarian = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    pet = relationship("Pet", back_populates="vaccinations")
