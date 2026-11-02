"""
Pet claiming fees (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md).

- ClaimFeeSchedule: charges the Barangay is authorized to collect, each with its legal basis (ordinance / policy).
  The dog impounding fine comes from RA 9482 and is fixed in code (app/utils/claim_fees.py), never stored here.
- ClaimAssessment: the itemized charges for one approved pet claim. One species, one fine category.
- ClaimAssessmentChange: every change to an assessment (who, when, previous / new value, reason). Never deleted.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ClaimFeeSchedule(Base):
    __tablename__ = "claim_fee_schedules"

    schedule_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # CAT_CLAIMING_FINE | IMPOUNDING_FEE | BOARDING_FEE_PER_DAY
    fee_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # Dog | Cat | None (applies to both) — the cat fine is always Cat
    species: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    min_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    max_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Required: the ordinance / resolution / policy that authorizes the charge
    legal_basis: Mapped[str] = mapped_column(Text, nullable=False)
    barangay_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("barangays.barangay_id", ondelete="CASCADE"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    deactivated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    deactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ClaimAssessment(Base):
    __tablename__ = "claim_assessments"

    assessment_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    claim_id: Mapped[int] = mapped_column(Integer, ForeignKey("pet_claims.claim_id", ondelete="CASCADE"), nullable=False, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True)
    holding_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("holding_animals.holding_id", ondelete="SET NULL"), nullable=True)
    species: Mapped[str] = mapped_column(String(10), nullable=False)  # Dog | Cat
    # DOG_IMPOUNDING_FINE | CAT_CLAIMING_FINE
    fine_category: Mapped[str] = mapped_column(String(40), nullable=False)
    # Dogs: the RA 9482 fine. Cats: the claiming charge staff entered by hand (never a default or computed amount).
    # NULL when no charge applies (cats: no_charge_applicable).
    fine_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    # Dogs: the RA 9482 citation. Cats: the reason / basis staff entered for the charge.
    fine_legal_basis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Cats only: what the charge is for, as entered by staff
    charge_description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Cats only: staff recorded that no claiming charge applies
    no_charge_applicable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    impounding_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    impounding_fee_basis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    boarding_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    boarding_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    boarding_fee_basis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_due: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    # Assessed | Paid | Waived | Cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Assessed", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assessed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    assessed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    amount_paid: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    receipt_number: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    payment_recorded_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    waiver_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    waived_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    waived_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    assessor = relationship("User", foreign_keys=[assessed_by])
    payment_recorder = relationship("User", foreign_keys=[payment_recorded_by])
    waiver = relationship("User", foreign_keys=[waived_by])


class ClaimAssessmentChange(Base):
    __tablename__ = "claim_assessment_changes"

    change_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    assessment_id: Mapped[int] = mapped_column(Integer, ForeignKey("claim_assessments.assessment_id", ondelete="CASCADE"), nullable=False, index=True)
    # created | adjusted | waived | payment_recorded | cancelled
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    field: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    previous_value: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user = relationship("User", foreign_keys=[changed_by])
