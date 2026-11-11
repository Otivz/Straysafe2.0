from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, Any, TYPE_CHECKING
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, JSON, func, ForeignKey, Numeric, Boolean, Enum
from sqlalchemy.orm import relationship, backref, Mapped, mapped_column
from app.database import Base
from app.models.user import User
from app.models.landmark import Landmark
from app.utils.case_vocab import ANIMAL_TYPE_LABELS

if TYPE_CHECKING:
    from app.models.report_dispute import ReportDispute


class ReportCategory(Base):
    __tablename__ = "report_categories"
    category_id = Column(Integer, primary_key=True, index=True)
    category_name = Column(String(100), unique=True, nullable=False)


# DB table is "report_status" (not "report_statuses")
class ReportStatus(Base):   
    __tablename__ = "report_status"
    status_id = Column(Integer, primary_key=True, index=True)
    status_name = Column(String(50), unique=True, nullable=False)


class Report(Base):
    __tablename__ = "reports"
    __allow_unmapped__ = True

    report_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("report_categories.category_id"), nullable=False)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # FK to pets omitted until pets table is created
    # Set when pet_id was inherited from another report's confirmed match in the same case (not confirmed on this report)
    pet_inherited_from_match_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Staff re-checked an inherited pet identity: only then does it count for bite/chase history, warnings, handover
    identity_rechecked_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    identity_rechecked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    identity_recheck_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Staff override: this report is a separate incident, not part of the pet's active case (reason required)
    separate_incident_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    separate_incident_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    separate_incident_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Dog, Cat and Unknown are the original values; the others were appended (db_migrations/case_alignment.py).
    # A report about any of them needs no pet registration.
    animal_type: Mapped[Optional[str]] = mapped_column(Enum(*ANIMAL_TYPE_LABELS), nullable=True, default='Unknown')
    animal_breed: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    animal_color: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    estimated_size: Mapped[Optional[str]] = mapped_column(Enum('Small', 'Medium', 'Large'), nullable=True)

    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    condition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    custody_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default='Sighting')

    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    initial_latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8), nullable=True)
    initial_longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8), nullable=True)
    initial_landmark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    facility_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("landmarks.landmark_id", ondelete="SET NULL"), nullable=True)

    animal_count: Mapped[int] = mapped_column(Integer, default=1)
    landmark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # DB ENUM: 'Low','Medium','High' only
    priority_level: Mapped[Optional[str]] = mapped_column(Enum('Low', 'Medium', 'High'), nullable=True, default='Medium')
    # Decided by the Subdivision Leader after verification (app/utils/report_visibility.py is the only writer)
    visibility: Mapped[Optional[str]] = mapped_column(Enum('Public', 'Private', 'Pending Review'), nullable=True, default='Pending Review')
    visibility_decided_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    visibility_decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    visibility_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_possible_owned: Mapped[bool] = mapped_column(Boolean, default=False)

    # AI Suggestions
    ai_animal_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_dominant_color: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_coat_pattern: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_estimated_size: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_possible_breed: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_suggested_risk_level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_suggested_priority: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_suggested_priority_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # AI Behavioral Analysis Suggestions (Contextual Understanding)
    ai_behavior_chasing: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_behavior_actual_bite: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_behavior_attempted_bite: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_behavior_injury: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_behavior_aggressive: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_behavior_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # AI Photo Analysis & Authenticity Verification
    ai_photo_likelihood: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    # YOLOv8 box confidence (0-1) of the best dog/cat detection across the report's photos; None = not measured
    ai_detection_confidence: Mapped[Optional[float]] = mapped_column(Numeric(4, 3), nullable=True)
    # Gemini's own confidence per suggested field: {"animal_type": "high"|"medium"|"low", ...}; None = not measured
    ai_description_confidence: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ai_photo_status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_photo_recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_photo_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # DB column is current_status_id (not status_id)
    current_status_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("report_status.status_id"), nullable=True)

    assigned_leader_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    unassigned_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Verification & Dispute Tracking
    verification_status: Mapped[Optional[str]] = mapped_column(Enum('unverified', 'verified_true', 'false_alarm', 'disputed'), default='unverified', nullable=True)
    false_alarm_reason: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    verification_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verified_by_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Verified Investigation Findings (Ground Truth vs Allegation)
    verified_actual_bite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    verified_chasing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    verified_attempted_bite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    verified_injury: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    verified_aggressive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    behavior_finding: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Case Transfer Workflow Fields
    pending_transfer_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    pending_transfer_from_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    pending_transfer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pending_transfer_created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Duplicate & Merge Tracking Fields
    duplicate_of_report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="SET NULL"), nullable=True)
    # Multi-animal reports (MULTI_ANIMAL_REPORT_PLAN.md): a per-animal record points at the group report it was split
    # from. The group report stays as the incident; each animal record goes through matching, ownership
    # claims and returns on its own.
    split_from_report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="SET NULL"), nullable=True, index=True)
    merged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    merged_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    merge_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # ── Case workflow (Subdivision Admin) ───────────────────────────────────────────────────────────────────────
    # The four global statuses: reported, under_review, in_progress, closed (app/utils/case_vocab.py). NULL reads as
    # "derive it from current_status_id". current_status_id stays the legacy ladder; a flush hook keeps the two in
    # step whichever one a code path changes (app/utils/case_status_sync.py).
    case_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)

    # Assessment: did the incident happen, is the evidence enough, how urgent is it. NULL incident_verification reads
    # the older verification_status instead.
    incident_verification: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    incident_basis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence_sufficiency: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    evidence_reviewed: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    urgency_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    urgency_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assessment_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assessed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    assessed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)

    # Which animal (when known) and who, if anyone, is responsible for it: separate questions, neither needs a pet record.
    identity_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    identity_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ownership_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ownership_owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    ownership_evidence: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    ownership_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ownership_decided_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    ownership_decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Closure: a documented outcome. A closed case does not necessarily mean the concern was resolved.
    closure_disposition: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    closure_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    reopened_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_reopened_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_reopened_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    last_reopen_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # A private complaint about a neighbour: never published automatically (and never offered as a community notice
    # by anything but an explicit staff action).
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")

    # A Lost Pet report: the pet as it was when the report was filed, and the last-seen details (utils/lost_pet_rules.py).
    # Built by the server from the pet record at filing and never rewritten, so editing the pet later does not change history.
    # NULL for every other report, and for older Lost Pet reports.
    pet_snapshot: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    # The browser's id for one Lost Pet submission: sending it again (a retry after a lost answer) returns the first report
    # instead of filing a second one (routes/reports.py; the pet row is locked, so two copies cannot both pass).
    client_request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Relationships
    reporter: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id], backref="reports")
    assigned_leader: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_leader_id])
    pending_transfer_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[pending_transfer_to_id])
    pending_transfer_from: Mapped[Optional["User"]] = relationship("User", foreign_keys=[pending_transfer_from_id])
    verified_by_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[verified_by_user_id])
    primary_report: Mapped[Optional["Report"]] = relationship("Report", foreign_keys=[duplicate_of_report_id], remote_side=[report_id], back_populates="merged_reports")
    merged_reports: Mapped[List["Report"]] = relationship("Report", foreign_keys=[duplicate_of_report_id], back_populates="primary_report")
    merged_by_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[merged_by])
    visibility_decider: Mapped[Optional["User"]] = relationship("User", foreign_keys=[visibility_decided_by])
    category = relationship("ReportCategory")
    status = relationship("ReportStatus")
    subdivision = relationship("Subdivision")
    media: Mapped[List["ReportMedia"]] = relationship("ReportMedia", back_populates="report", cascade="all, delete-orphan")
    history: Mapped[List["StatusHistory"]] = relationship("StatusHistory", back_populates="report", cascade="all, delete-orphan", order_by="StatusHistory.created_at")
    disputes: Mapped[List["ReportDispute"]] = relationship("ReportDispute", back_populates="report", cascade="all, delete-orphan", order_by="ReportDispute.created_at.desc()")
    facility: Mapped[Optional["Landmark"]] = relationship("Landmark", foreign_keys=[facility_id])

    # Transient fields populated at runtime (not DB columns)
    reporter_name: Optional[str] = None
    status_id: Optional[int] = None
    assigned_leader_name: Optional[str] = None
    assigned_leader_photo: Optional[str] = None
    pending_transfer_to_name: Optional[str] = None
    pending_transfer_from_name: Optional[str] = None
    merged_by_name: Optional[str] = None


class ReportMedia(Base):
    __tablename__ = "report_media"
    __allow_unmapped__ = True

    media_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False)
    history_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("status_history.history_id", ondelete="SET NULL"), nullable=True)
    status_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("report_status.status_id", ondelete="SET NULL"), nullable=True)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    # DB ENUM: 'Image','Video','Document'
    media_type: Mapped[str] = mapped_column(Enum('Image', 'Video', 'Document'), nullable=False)
    animal_type: Mapped[Optional[str]] = mapped_column(Enum('Dog', 'Cat', 'Unknown'), nullable=True, default='Unknown')
    dominant_color: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # e.g., 'Brown', 'Black and White', 'Golden'
    is_evidence: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_photo_likelihood: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    ai_detection_confidence: Mapped[Optional[float]] = mapped_column(Numeric(4, 3), nullable=True)  # YOLOv8, this file
    ai_photo_status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    uploaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    report = relationship("Report", back_populates="media")
    history = relationship("StatusHistory", back_populates="media")


class StatusHistory(Base):
    __tablename__ = "status_history"
    __allow_unmapped__ = True

    history_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=True)
    report_status_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("report_status.status_id"), nullable=True)
    updated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8), nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8), nullable=True)
    landmark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    facility_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("landmarks.landmark_id", ondelete="SET NULL"), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())

    report: Mapped[Optional["Report"]] = relationship("Report", back_populates="history")
    updater: Mapped[Optional["User"]] = relationship("User")
    media: Mapped[List["ReportMedia"]] = relationship("ReportMedia", back_populates="history")
    facility: Mapped[Optional["Landmark"]] = relationship("Landmark", foreign_keys=[facility_id])

    # Transient fields
    updater_name: Optional[str] = None
    facility_name: Optional[str] = None


class ReportReturn(Base):
    """
    Official record that an animal was returned to / reunited with its owner.
    The owner either has a StraySafe account (owner_user_id is set) or is recorded manually (owner_user_id is NULL);
    the owner details are always snapshotted here so the record stays meaningful without an account.
    """
    __tablename__ = "report_returns"

    return_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True)
    has_account: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    owner_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    owner_name: Mapped[str] = mapped_column(String(150), nullable=False)
    owner_phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    owner_email: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    owner_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    relationship_to_animal: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    id_presented: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    # Proof: ID type + last 4 digits only (no ID images are stored), handover photo, optional ownership proof
    id_type: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    id_last4: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    ownership_verified_by_record: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    handover_photo_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ownership_proof_urls: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    returned_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    returned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    owner = relationship("User", foreign_keys=[owner_user_id])
    returner = relationship("User", foreign_keys=[returned_by])
