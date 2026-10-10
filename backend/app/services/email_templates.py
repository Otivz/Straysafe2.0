import html
import os
from datetime import datetime
from typing import Dict, Optional, Tuple, Any

# Brand constants
BRAND_COLOR = "#F97316"
BRAND_HOVER = "#EA580C"
BRAND_DARK = "#1A1208"
BG_LIGHT = "#FFF7ED"
BORDER_COLOR = "#FED7AA"
TEXT_MUTED = "#6B7280"
TEXT_MAIN = "#1F2937"

def get_base_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

def _build_html_wrapper(
    header_badge: str,
    title: str,
    intro_message: str,
    details_rows: list[Tuple[str, str]],
    cta_text: Optional[str] = None,
    cta_url: Optional[str] = None,
    secondary_note: Optional[str] = None,
    user_name: Optional[str] = None,
) -> str:
    """
    Renders a mobile-responsive, cleanly branded StraySafe HTML email.
    """
    frontend_url = get_base_url()
    safe_title = html.escape(title)
    safe_badge = html.escape(header_badge)
    safe_intro = html.escape(intro_message)
    greeting = f"Hi {html.escape(user_name)}," if user_name else "Hello,"

    # Build rows HTML
    rows_html = ""
    for label, val in details_rows:
        safe_l = html.escape(label)
        safe_v = html.escape(val)
        rows_html += f"""
        <tr>
          <td style="padding:8px 0;color:{TEXT_MUTED};font-size:13px;width:38%;font-weight:600;vertical-align:top;">{safe_l}</td>
          <td style="padding:8px 0;color:{TEXT_MAIN};font-size:13px;font-weight:700;vertical-align:top;">{safe_v}</td>
        </tr>
        """

    cta_button = ""
    if cta_text and cta_url:
        full_cta_url = cta_url if cta_url.startswith("http") else f"{frontend_url}/{cta_url.lstrip('/')}"
        safe_btn_url = html.escape(full_cta_url)
        safe_btn_text = html.escape(cta_text)
        cta_button = f"""
        <div style="margin:28px 0 20px;text-align:center;">
          <a href="{safe_btn_url}" style="background-color:{BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;display:inline-block;box-shadow:0 2px 4px rgba(249,115,22,0.25);">
            {safe_btn_text} &rarr;
          </a>
        </div>
        """

    sec_note_html = ""
    if secondary_note:
        safe_sec = html.escape(secondary_note)
        sec_note_html = f"""
        <p style="margin:16px 0 0;font-size:12px;color:{TEXT_MUTED};line-height:1.5;background:#F9FAFB;padding:10px 14px;border-radius:8px;">
          ℹ️ {safe_sec}
        </p>
        """

    preferences_url = f"{frontend_url}/citizen/settings?tab=notifications"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:540px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);border:1px solid #E5E7EB;" cellspacing="0" cellpadding="0" border="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding:22px 28px;background-color:{BG_LIGHT};border-top:4px solid {BRAND_COLOR};border-bottom:1px solid {BORDER_COLOR};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:900;color:{BRAND_DARK};letter-spacing:-0.5px;">🐾 Stray<span style="color:{BRAND_COLOR};">Safe</span></span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 12px;background:#FFEDD5;color:#C2410C;border:1px solid {BORDER_COLOR};border-radius:20px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">
                      {safe_badge}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:28px 28px 20px;">
              <h2 style="margin:0 0 12px;font-size:18px;font-weight:800;color:{BRAND_DARK};line-height:1.3;">
                {safe_title}
              </h2>
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                {greeting}
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#4B5563;line-height:1.6;">
                {safe_intro}
              </p>

              <!-- Details Card -->
              <table role="presentation" width="100%" style="background:{BG_LIGHT};border:1px solid {BORDER_COLOR};border-radius:12px;padding:12px 18px;margin-bottom:8px;" cellspacing="0" cellpadding="0" border="0">
                {rows_html}
              </table>

              {sec_note_html}
              {cta_button}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 28px;background:#F9FAFB;border-top:1px solid #E5E7EB;font-size:11px;color:#9CA3AF;line-height:1.6;text-align:center;">
              <p style="margin:0 0 6px;">
                You received this operational email because you have an active account or registered report on <b>StraySafe</b>.
              </p>
              <p style="margin:0;">
                To update your email preferences or opt out of optional notifications, visit your 
                <a href="{preferences_url}" style="color:{BRAND_COLOR};text-decoration:none;font-weight:700;">Account Notification Settings</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


# =============================================================================
# TEMPLATE BUILDERS FOR OPERATIONAL EVENTS
# =============================================================================

def render_report_submitted_email(
    user_name: Optional[str],
    report_id: int,
    animal_type: str,
    animal_breed: Optional[str],
    landmark: Optional[str],
    priority: str,
) -> Tuple[str, str, str]:
    """Confirmation email to the resident that their stray report was received."""
    subject = f"StraySafe: Report #{report_id} Submitted Successfully"
    animal_info = f"{animal_breed} ({animal_type})" if animal_breed else (animal_type or "Animal")
    landmark_str = landmark or "Designated Location"
    
    details = [
        ("Report ID", f"#{report_id}"),
        ("Animal", animal_info),
        ("Location / Landmark", landmark_str),
        ("Initial Status", "Pending Review"),
        ("Priority Level", priority or "Medium"),
        ("Submitted At", datetime.now().strftime("%b %d, %Y %I:%M %p")),
    ]
    
    intro = f"Your stray animal report has been successfully recorded. Subdivision officials and authorized responders have been notified to inspect and verify the case."
    cta_url = f"/citizen/report/{report_id}"
    
    html_content = _build_html_wrapper(
        header_badge="Report Received",
        title=f"Report #{report_id} Confirmed",
        intro_message=intro,
        details_rows=details,
        cta_text="View Report Status",
        cta_url=cta_url,
        secondary_note="You will receive updates when responders verify the report, dispatch assistance, or identify potential pet owners.",
        user_name=user_name
    )
    
    text_content = (
        f"Hi {user_name or 'there'},\n\n"
        f"Your stray report #{report_id} has been submitted successfully.\n"
        f"- Animal: {animal_info}\n"
        f"- Location: {landmark_str}\n"
        f"- Status: Pending Review\n\n"
        f"Track your report here: {get_base_url()}{cta_url}\n\n"
        "— StraySafe Team"
    )
    return subject, text_content, html_content


def render_report_status_email(
    user_name: Optional[str],
    report_id: int,
    status_name: str,
    remarks: Optional[str],
    landmark: Optional[str],
) -> Tuple[str, str, str]:
    """Status milestone update email for resident reporter."""
    subject = f"StraySafe Update: Report #{report_id} is now '{status_name}'"
    landmark_str = landmark or "Incident Location"
    
    details = [
        ("Report ID", f"#{report_id}"),
        ("Updated Status", status_name),
        ("Location", landmark_str),
        ("Updated At", datetime.now().strftime("%b %d, %Y %I:%M %p")),
    ]
    if remarks:
        details.append(("Official Remarks", remarks))
        
    intro = f"The status of your stray report #{report_id} has been updated by authorized officials."
    cta_url = f"/citizen/report/{report_id}"
    
    html_content = _build_html_wrapper(
        header_badge="Status Update",
        title=f"Report #{report_id} Status: {status_name}",
        intro_message=intro,
        details_rows=details,
        cta_text="View Case Timeline",
        cta_url=cta_url,
        user_name=user_name
    )
    
    text_content = (
        f"Hi {user_name or 'there'},\n\n"
        f"Report #{report_id} status has been updated to '{status_name}'.\n"
        f"{'Remarks: ' + remarks if remarks else ''}\n\n"
        f"View report: {get_base_url()}{cta_url}\n\n"
        "— StraySafe Team"
    )
    return subject, text_content, html_content


def render_ai_match_alert_email(
    user_name: Optional[str],
    pet_name: str,
    report_id: int,
    match_score: int,
    landmark: Optional[str],
) -> Tuple[str, str, str]:
    """Look-alike AI match alert sent to registered pet owner."""
    subject = f"🔍 StraySafe Alert: Look-Alike Sighting for '{pet_name}' ({match_score}% Match)"
    landmark_str = landmark or "Reported Location"
    
    details = [
        ("Registered Pet", pet_name),
        ("Sighting Report", f"#{report_id}"),
        ("AI Match Confidence", f"{match_score}% Similarity"),
        ("Sighting Location", landmark_str),
        ("Detected At", datetime.now().strftime("%b %d, %Y %I:%M %p")),
    ]
    
    intro = (
        f"Our AI vision system detected a high-confidence look-alike match for your registered pet '{pet_name}' "
        f"in Report #{report_id}. Please review the photo and confirm whether this is your pet."
    )
    cta_url = f"/citizen/matches"
    
    html_content = _build_html_wrapper(
        header_badge="Pet Match Alert",
        title=f"Potential Sighting of '{pet_name}'",
        intro_message=intro,
        details_rows=details,
        cta_text="Review Pet Match Now",
        cta_url=cta_url,
        secondary_note="Confirming the match connects you directly with the handling officer to coordinate safe recovery.",
        user_name=user_name
    )
    
    text_content = (
        f"Hi {user_name or 'there'},\n\n"
        f"AI detected a {match_score}% look-alike match for your pet '{pet_name}' in Report #{report_id} near {landmark_str}.\n\n"
        f"Review sighting: {get_base_url()}{cta_url}\n\n"
        "— StraySafe Team"
    )
    return subject, text_content, html_content


def render_claim_decision_email(
    user_name: Optional[str],
    pet_name: str,
    report_id: int,
    claim_status: str,
    remarks: Optional[str],
) -> Tuple[str, str, str]:
    """Notification when a pet claim is Approved or Rejected."""
    is_approved = claim_status == "Approved"
    badge = "Claim Approved" if is_approved else "Claim Decision"
    title = f"Pet Claim {claim_status} for '{pet_name}'"
    subject = f"StraySafe: Pet Claim for '{pet_name}' has been {claim_status}"
    
    details = [
        ("Pet Name", pet_name),
        ("Report ID", f"#{report_id}"),
        ("Claim Decision", claim_status),
        ("Decision Date", datetime.now().strftime("%b %d, %Y %I:%M %p")),
    ]
    if remarks:
        details.append(("Officer Notes", remarks))
        
    if is_approved:
        intro = f"Great news! Your ownership claim for pet '{pet_name}' on Report #{report_id} has been APPROVED by officials. You can coordinate handover and physical pickup."
        sec_note = "Bring your valid government ID and ownership records when picking up your pet."
    else:
        intro = f"Your claim for pet '{pet_name}' on Report #{report_id} was not approved as submitted."
        sec_note = "You may submit additional distinctive markings, veterinary records, or vaccination proof to request re-evaluation."
        
    cta_url = f"/citizen/claims"
    
    html_content = _build_html_wrapper(
        header_badge=badge,
        title=title,
        intro_message=intro,
        details_rows=details,
        cta_text="View Claim Details",
        cta_url=cta_url,
        secondary_note=sec_note,
        user_name=user_name
    )
    
    text_content = (
        f"Hi {user_name or 'there'},\n\n"
        f"Your claim for '{pet_name}' on Report #{report_id} is {claim_status}.\n"
        f"{'Notes: ' + remarks if remarks else ''}\n\n"
        f"Check details: {get_base_url()}{cta_url}\n\n"
        "— StraySafe Team"
    )
    return subject, text_content, html_content


def render_pet_reunited_email(
    user_name: Optional[str],
    pet_name: str,
    report_id: int,
    reunited_with: str,
) -> Tuple[str, str, str]:
    """Safe recovery / handover completion email."""
    subject = f"🎉 StraySafe: '{pet_name}' Safely Reunited!"
    details = [
        ("Pet", pet_name),
        ("Report ID", f"#{report_id}"),
        ("Reunited With", reunited_with),
        ("Handover Date", datetime.now().strftime("%b %d, %Y %I:%M %p")),
        ("Case Status", "Resolved & Closed"),
    ]
    
    intro = f"The physical handover and recovery verification for '{pet_name}' has been successfully completed. Report #{report_id} is now officially closed. Thank you for using StraySafe!"
    cta_url = f"/citizen/my-pets"
    
    html_content = _build_html_wrapper(
        header_badge="Reunion Complete",
        title=f"'{pet_name}' Safely Reunited",
        intro_message=intro,
        details_rows=details,
        cta_text="View Pet Profile",
        cta_url=cta_url,
        user_name=user_name
    )
    
    text_content = (
        f"Hi {user_name or 'there'},\n\n"
        f"Physical handover for '{pet_name}' on Report #{report_id} is complete and verified!\n"
        f"Case is officially closed.\n\n"
        "— StraySafe Team"
    )
    return subject, text_content, html_content


def render_qr_scanned_email(
    user_name: Optional[str],
    pet_name: str,
    landmark: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
) -> Tuple[str, str, str]:
    """Emergency alert when a pet's QR collar tag is scanned by a finder."""
    subject = f"🚨 StraySafe URGENT: QR Tag Scanned for '{pet_name}'!"
    loc_str = landmark or "Unknown Location"
    if latitude and longitude:
        loc_str += f" ({latitude:.4f}, {longitude:.4f})"
        
    details = [
        ("Pet Name", pet_name),
        ("Scan Location", loc_str),
        ("Timestamp", datetime.now().strftime("%b %d, %Y %I:%M %p")),
        ("Alert Level", "HIGH - Collar Scanned"),
    ]
    
    intro = f"A community member or officer just scanned the official QR collar tag for your pet '{pet_name}'. Check your account immediately to view finder contact details or reported GPS coordinates."
    cta_url = f"/citizen/my-pets"
    
    html_content = _build_html_wrapper(
        header_badge="QR Tag Scanned",
        title=f"Collar QR Scanned for '{pet_name}'",
        intro_message=intro,
        details_rows=details,
        cta_text="View Pet QR Location",
        cta_url=cta_url,
        secondary_note="If your pet is lost, mark its status as 'Lost' to notify community leaders in the vicinity.",
        user_name=user_name
    )
    
    text_content = (
        f"URGENT: The QR collar tag for '{pet_name}' was scanned near {loc_str}.\n"
        f"View details: {get_base_url()}{cta_url}\n\n"
        "— StraySafe Team"
    )
    return subject, text_content, html_content


def render_owner_warning_email(
    user_name: Optional[str],
    pet_name: Optional[str],
    warning_level: str,
    violation_type: str,
    description: str,
) -> Tuple[str, str, str]:
    """Official ordinance citation / warning issued to pet owner."""
    subject = f"⚠️ Official Notice: {warning_level} ({violation_type})"
    pet_str = pet_name or "Registered Pet"
    
    details = [
        ("Notice Level", warning_level),
        ("Violation Type", violation_type),
        ("Pet", pet_str),
        ("Issued Date", datetime.now().strftime("%b %d, %Y %I:%M %p")),
    ]
    
    intro = f"An authorized subdivision or municipal officer has issued an official {warning_level} regarding '{violation_type}'. Please review the details below and log in to acknowledge the notice."
    cta_url = f"/citizen/settings?tab=account"
    
    html_content = _build_html_wrapper(
        header_badge="Official Citation",
        title=f"{warning_level} Notice Issued",
        intro_message=intro,
        details_rows=details,
        cta_text="Review & Acknowledge",
        cta_url=cta_url,
        secondary_note=f"Officer remarks: {description}",
        user_name=user_name
    )
    
    text_content = (
        f"Notice: A {warning_level} was issued regarding '{violation_type}' for {pet_str}.\n"
        f"Details: {description}\n\n"
        f"Review on StraySafe: {get_base_url()}{cta_url}\n\n"
        "— StraySafe Administration"
    )
    return subject, text_content, html_content


# ── OFFICIALS & RESCUE EMAILS ──

def render_leader_new_report_email(
    leader_name: Optional[str],
    report_id: int,
    animal_type: str,
    landmark: Optional[str],
    subdivision_name: Optional[str],
    priority: str,
) -> Tuple[str, str, str]:
    """Alert to subdivision leader of a newly submitted stray report."""
    subject = f"⚠️ New Stray Report #{report_id} Awaiting Verification ({subdivision_name or 'Subdivision'})"
    details = [
        ("Report ID", f"#{report_id}"),
        ("Animal Type", animal_type or "Stray Animal"),
        ("Subdivision", subdivision_name or "Assigned Jurisdiction"),
        ("Location Landmark", landmark or "Reported Location"),
        ("Priority Level", priority or "Medium"),
        ("Submitted At", datetime.now().strftime("%b %d, %Y %I:%M %p")),
    ]
    
    intro = f"A new resident stray report has been submitted in your subdivision and is awaiting verification and initial assessment."
    cta_url = f"/subdivision/reports/{report_id}"
    
    html_content = _build_html_wrapper(
        header_badge="Action Required",
        title=f"New Report #{report_id} in {subdivision_name or 'Subdivision'}",
        intro_message=intro,
        details_rows=details,
        cta_text="Verify Report",
        cta_url=cta_url,
        user_name=leader_name
    )
    
    text_content = (
        f"New Report #{report_id} in {subdivision_name or 'your subdivision'}.\n"
        f"Animal: {animal_type}, Location: {landmark}\n"
        f"Verify: {get_base_url()}{cta_url}\n\n"
        "— StraySafe System"
    )
    return subject, text_content, html_content


def render_unassigned_reminder_email(
    leader_name: Optional[str],
    report_id: int,
    animal_type: str,
    landmark: Optional[str],
    minutes_unassigned: int,
) -> Tuple[str, str, str]:
    """Reminder to subdivision leaders for reports unassigned > 30 mins."""
    subject = f"⏰ Action Reminder: Report #{report_id} Unassigned ({minutes_unassigned}m)"
    details = [
        ("Report ID", f"#{report_id}"),
        ("Animal", animal_type or "Stray"),
        ("Location", landmark or "Location"),
        ("Time Unhandled", f"{minutes_unassigned} minutes"),
    ]
    
    intro = f"Report #{report_id} has been active for {minutes_unassigned} minutes without an assigned leader. Please assign an officer or claim the case to proceed with verification."
    cta_url = f"/subdivision/reports/{report_id}"
    
    html_content = _build_html_wrapper(
        header_badge="Unassigned Alert",
        title=f"Report #{report_id} Needs Attention",
        intro_message=intro,
        details_rows=details,
        cta_text="Claim Report Now",
        cta_url=cta_url,
        user_name=leader_name
    )
    
    text_content = (
        f"Reminder: Report #{report_id} has been unassigned for {minutes_unassigned} minutes.\n"
        f"View report: {get_base_url()}{cta_url}\n"
    )
    return subject, text_content, html_content


def render_brgy_escalated_report_email(
    staff_name: Optional[str],
    report_id: int,
    animal_type: str,
    landmark: Optional[str],
    reason: Optional[str],
) -> Tuple[str, str, str]:
    """Notification to Barangay staff when a report is escalated from a subdivision."""
    subject = f"🚨 Escalated Case #{report_id} Transferred to Barangay Staff"
    details = [
        ("Report ID", f"#{report_id}"),
        ("Animal", animal_type or "Stray"),
        ("Location", landmark or "Location"),
        ("Escalation Reason", reason or "Subdivision Referral / Municipal Intervention"),
        ("Escalated At", datetime.now().strftime("%b %d, %Y %I:%M %p")),
    ]
    
    intro = f"A stray report has been formally escalated to Barangay staff for municipal intervention, rescue dispatch, or holding facility intake."
    cta_url = f"/barangay/reports/{report_id}"
    
    html_content = _build_html_wrapper(
        header_badge="Escalated Case",
        title=f"Report #{report_id} Escalated to Barangay",
        intro_message=intro,
        details_rows=details,
        cta_text="View Municipal Case",
        cta_url=cta_url,
        user_name=staff_name
    )
    
    text_content = (
        f"Case #{report_id} has been escalated to Barangay.\n"
        f"Reason: {reason or 'Subdivision Escalation'}\n"
        f"View: {get_base_url()}{cta_url}\n"
    )
    return subject, text_content, html_content


def render_rescue_assignment_email(
    staff_name: Optional[str],
    rescue_id: int,
    report_id: int,
    animal_type: str,
    landmark: Optional[str],
    team_name: Optional[str],
) -> Tuple[str, str, str]:
    """Notification to personnel assigned to a rescue dispatch."""
    subject = f"🚑 Rescue Dispatch Assignment: Rescue #{rescue_id} (Report #{report_id})"
    details = [
        ("Rescue ID", f"#{rescue_id}"),
        ("Report ID", f"#{report_id}"),
        ("Animal", animal_type or "Animal in need"),
        ("Target Location", landmark or "Dispatched Area"),
        ("Assigned Team", team_name or "Barangay Animal Response"),
    ]
    
    intro = f"You have been assigned to an animal rescue operation. Review the incident details and location landmarks prior to deployment."
    cta_url = f"/barangay/rescues/{rescue_id}"
    
    html_content = _build_html_wrapper(
        header_badge="Rescue Dispatch",
        title=f"Assigned to Rescue #{rescue_id}",
        intro_message=intro,
        details_rows=details,
        cta_text="View Rescue Details",
        cta_url=cta_url,
        user_name=staff_name
    )
    
    text_content = (
        f"You have been assigned to Rescue #{rescue_id} for Report #{report_id}.\n"
        f"Location: {landmark}\n"
        f"View: {get_base_url()}{cta_url}\n"
    )
    return subject, text_content, html_content
