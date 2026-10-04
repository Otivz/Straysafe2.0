"""
Public adoption-certificate verification (the target of the certificate QR code).

Returns only what is needed to authenticate a printed certificate: validity, pet, barangay, issue date,
signatory and the adopter's initials. Never returns the address, phone or ID of the adopter.
"""
import hmac
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.limiter import limiter
from app.models.report import Adoption, AdoptionCertificate

router = APIRouter(prefix="/certificates", tags=["certificates"])


class CertificateVerifyResponse(BaseModel):
    valid: bool
    status: str  # Valid / Pending_Handover / Revoked / Not_Found / Tampered
    message: str
    certificate_number: Optional[str] = None
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    adopter_initials: Optional[str] = None
    barangay_name: Optional[str] = None
    municipality_city: Optional[str] = None
    signatory_name: Optional[str] = None
    signatory_position: Optional[str] = None
    issued_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


def _initials(name: Optional[str]) -> Optional[str]:
    parts = [p for p in (name or "").replace(".", " ").split() if p]
    return " ".join(f"{p[0].upper()}." for p in parts[:3]) or None


@router.get("/verify/{certificate_number}", response_model=CertificateVerifyResponse)
@limiter.limit("30/minute")
def verify_certificate(request: Request, certificate_number: str, h: Optional[str] = None, db: Session = Depends(get_db)):
    cert = (
        db.query(AdoptionCertificate)
        .options(joinedload(AdoptionCertificate.adoption).joinedload(Adoption.animal))
        .filter(AdoptionCertificate.certificate_number == certificate_number.strip())
        .first()
    )
    if not cert:
        return CertificateVerifyResponse(valid=False, status="Not_Found",
                                         message="No adoption certificate with this number exists.")
    # The QR carries the first 16 hex chars of the SHA-256 verification hash; compare in constant time.
    if h is not None and not hmac.compare_digest(h.strip().lower(), cert.verification_hash[:16].lower()):
        return CertificateVerifyResponse(valid=False, status="Tampered", certificate_number=cert.certificate_number,
                                         message="The security code does not match this certificate. The document may have been altered.")
    app = cert.adoption
    snap = cert.snapshot or {}
    base = dict(
        certificate_number=cert.certificate_number,
        pet_name=snap.get("animal_name") or (app.animal.animal_name if app and app.animal else None),
        pet_type=snap.get("animal_type") or (app.animal.animal_type if app and app.animal else None),
        adopter_initials=_initials(snap.get("adopter_name") or (app.full_name if app else None)),
        barangay_name=snap.get("barangay_name"),
        municipality_city=snap.get("municipality_city"),
        signatory_name=cert.signatory_name,
        signatory_position=cert.signatory_position,
        issued_at=cert.issued_at,
        revoked_at=cert.revoked_at,
    )
    if cert.certificate_status == "Revoked":
        return CertificateVerifyResponse(valid=False, status="Revoked",
                                         message=f"This certificate was revoked ({cert.revoked_reason or 'adoption not completed'}).", **base)
    if not (app and app.staff_handed_over and app.is_handed_over):
        return CertificateVerifyResponse(valid=False, status="Pending_Handover",
                                         message="Issued, but the pet has not been handed over yet. Ownership is not final.", **base)
    return CertificateVerifyResponse(valid=True, status="Valid", message="Authentic adoption certificate.", **base)
