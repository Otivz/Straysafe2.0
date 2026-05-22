from typing import Optional
from sqlalchemy import Column, Integer, String, Boolean, DateTime, func, ForeignKey, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

class Role(Base):
    __tablename__ = "roles"
    role_id = Column(Integer, primary_key=True, index=True)
    role_name = Column(String(50), unique=True, nullable=False)

class Position(Base):
    __tablename__ = "positions"
    position_id = Column(Integer, primary_key=True, index=True)
    position_name = Column(String(100), unique=True, nullable=False)

class Barangay(Base):
    __tablename__ = "barangays"
    barangay_id = Column(Integer, primary_key=True, index=True)
    barangay_name = Column(String(100), unique=True, nullable=False)
    city = Column(String(100), nullable=False)
    contact_no = Column(String(20), nullable=True)

class Subdivision(Base):
    __tablename__ = "subdivisions"
    subdivision_id = Column(Integer, primary_key=True, index=True)
    barangay_id = Column(Integer, ForeignKey("barangays.barangay_id"), nullable=False)
    subdivision_name = Column(String(100), nullable=False)
    
    barangay = relationship("Barangay")

class User(Base):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.role_id"), nullable=False)
    position_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("positions.position_id"), nullable=True)
    subdivision_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=True)
    
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    profile_picture: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    status: Mapped[Optional[str]] = mapped_column(Enum('Active','Inactive','Suspended', name='user_status'), nullable=True, default='Active')
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    role = relationship("Role")
    position = relationship("Position")
    subdivision = relationship("Subdivision")
