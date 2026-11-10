from app.models.user import Role, Position, Barangay, Subdivision, User
from app.models.pet import Pet
from app.models.system_setting import SystemSetting  # noqa: F401  (needed by the Animal Reference Code counter)
from app.models.ai_job import AiJob  # noqa: F401
from app.models.ai_vision_comparison import AiVisionComparison  # noqa: F401
from app.models.pet_history import PetHistory
from app.models.pet_owner_confirmation import PetOwnerConfirmation  # noqa: F401
from app.models.report import ReportCategory, ReportStatus, Report, ReportMedia, StatusHistory, ReportReturn  # noqa: F401
from app.models.lost_pet_alert import LostPetAlert, LostPetSighting  # noqa: F401
from app.models.report_dispute import ReportDispute
from app.models.report_match import ReportMatch
from app.models.manual_match import ManualMatchDecision  # noqa: F401
from app.models.pet_match_confirmation import PetMatchConfirmationRequest  # noqa: F401
from app.models.warning import OwnerWarning
from app.models.owner_followup import OwnerFollowUp, FollowUpContactLog, OwnerObservationUpdate, OwnerObservationUpdatePhoto, FollowUpRepeatedIncident  # noqa: F401
from app.models.leader_identity import LeaderIdentityVerification  # noqa: F401
from app.models.barangay_referral import BarangayReferral, BarangayReferralUpdate  # noqa: F401  (external referral log)
from app.models.case_records import CaseFollowUp, CaseContactLog, CaseLink, OwnershipClaim  # noqa: F401  (case details)
from app.models.chat import ChatThread, ChatMessage
from app.models.notification import Notification
from app.models.notification_preference import UserNotificationPreference
from app.models.email_log import EmailLog
from app.models.push import PushSubscription, PushDelivery  # noqa: F401
from app.models.announcement import AnnouncementCategory, Announcement, AnnouncementMedia
from app.models.audit_log import AuditLog
from app.models.revoked_token import RevokedToken
from app.models.coverage import CoverageSetting
from app.models.otp import OtpVerification

__all__ = [
    "Role", "Position", "Barangay", "Subdivision", "User",
    "Pet", "PetHistory",
    "ReportCategory", "ReportStatus", "Report", "ReportMedia", "StatusHistory", "ReportReturn",
    "ReportDispute",
    "ReportMatch",
    "OwnerWarning",
    "OwnerFollowUp", "FollowUpContactLog",
    "ChatThread", "ChatMessage",
    "Notification",
    "UserNotificationPreference",
    "EmailLog",
    "AnnouncementCategory", "Announcement", "AnnouncementMedia",
    "AuditLog",
    "RevokedToken",
    "CoverageSetting",
    "OtpVerification"
]

# Keep case_status and the legacy status in step, whichever one a code path changes. Imported BEFORE the closure
# hook below so a legacy status derived from case_status is seen by it.
import app.utils.case_status_sync  # noqa: E402,F401
# Closing a report ends its owner follow-up and lost-pet alert, whichever route closes it
import app.utils.case_closure  # noqa: E402,F401
