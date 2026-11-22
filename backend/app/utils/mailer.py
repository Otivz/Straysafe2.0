import html
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    return bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASSWORD"))


def send_email(to: str, subject: str, text: str, html_body: Optional[str] = None) -> bool:
    """Send one email over SMTP (STARTTLS). Returns False instead of raising so callers can tell the user."""
    if not email_configured():
        logger.warning("Email not sent to %s: SMTP_USER / SMTP_PASSWORD are not set", to)
        return False

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    # Google shows App Passwords in groups of four ("abcd efgh ...").
    password = os.getenv("SMTP_PASSWORD", "").replace(" ", "")
    from_name = os.getenv("SMTP_FROM_NAME", "StraySafe")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, user))
    msg["To"] = to
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(user, password)
            smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError):
        logger.exception("Failed to send email to %s", to)
        return False


def send_password_reset_email(to: str, name: Optional[str], code: str, minutes: int = 10) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\n"
        f"Someone asked to reset the password for your StraySafe account. Your reset code is: {code}\n\n"
        f"It expires in {minutes} minutes. If this wasn't you, ignore this email: your password stays the same.\n\n"
        "— StraySafe"
    )
    safe_greeting = html.escape(greeting)
    html_body = f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1208">
  <h2 style="margin:0 0 4px;color:#F97316">StraySafe</h2>
  <p style="margin:0 0 20px;color:#9c8670;font-size:13px">Password reset</p>
  <p>{safe_greeting}</p>
  <p>Someone asked to reset the password for your StraySafe account. Your reset code is:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px;text-align:center;margin:16px 0">{code}</p>
  <p style="font-size:13px;color:#555">It expires in {minutes} minutes. Never share this code with anyone, including StraySafe staff.</p>
  <p style="font-size:13px;color:#555">If this wasn't you, ignore this email: your password stays the same.</p>
</div>"""
    return send_email(to, f"Your StraySafe password reset code: {code}", text, html_body)


def send_admin_login_code_email(to: str, name: Optional[str], code: str, minutes: int = 10) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\n"
        f"Your StraySafe administrator sign-in code is: {code}\n\n"
        f"It expires in {minutes} minutes. If you didn't just enter your password on the admin sign-in page, "
        "someone else knows your password: change it right away.\n\n"
        "— StraySafe"
    )
    safe_greeting = html.escape(greeting)
    html_body = f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1208">
  <h2 style="margin:0 0 4px;color:#F97316">StraySafe</h2>
  <p style="margin:0 0 20px;color:#9c8670;font-size:13px">Administrator sign-in</p>
  <p>{safe_greeting}</p>
  <p>Your sign-in code is:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px;text-align:center;margin:16px 0">{code}</p>
  <p style="font-size:13px;color:#555">It expires in {minutes} minutes. Never share this code with anyone.</p>
  <p style="font-size:13px;color:#b91c1c"><b>Didn't just sign in?</b> Someone else may know your password. Change it right away.</p>
</div>"""
    return send_email(to, f"Your StraySafe admin sign-in code: {code}", text, html_body)


def send_account_invite_email(
    to: str, name: Optional[str], role_label: str, code: str, hours: int, login_url: Optional[str] = None
) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    link_line = f"\nSign-in page: {login_url}\n" if login_url else "\n"
    text = (
        f"{greeting}\n\n"
        f"An administrator created a StraySafe account for you ({role_label}).\n\n"
        f"To finish setting it up, open the sign-in page, click \"Forgot password?\", choose "
        f"\"I already have a code\", and enter this code with a password of your choice:\n\n"
        f"    {code}\n"
        f"{link_line}\n"
        f"The code is valid for {hours} hours. If you weren't expecting this, you can ignore this email.\n\n"
        "— StraySafe"
    )
    safe_greeting = html.escape(greeting)
    safe_role = html.escape(role_label)
    button = (
        f'<p style="margin:20px 0"><a href="{html.escape(login_url)}" style="background:#F97316;color:#fff;'
        f'text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:12px;display:inline-block">Open sign-in page</a></p>'
        if login_url else ""
    )
    html_body = f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1208">
  <h2 style="margin:0 0 4px;color:#F97316">StraySafe</h2>
  <p style="margin:0 0 20px;color:#9c8670;font-size:13px">Your account is ready</p>
  <p>{safe_greeting}</p>
  <p>An administrator created a StraySafe account for you (<b>{safe_role}</b>). To finish setting it up:</p>
  <ol style="font-size:14px;line-height:1.7;padding-left:20px">
    <li>Open the sign-in page and click <b>Forgot password?</b></li>
    <li>Choose <b>I already have a code</b></li>
    <li>Enter your email, this code, and a password of your choice</li>
  </ol>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px;text-align:center;margin:16px 0">{code}</p>
  {button}
  <p style="font-size:13px;color:#555">The code is valid for {hours} hours. Never share it with anyone. If you weren't expecting this email, you can ignore it.</p>
</div>"""
    return send_email(to, "Your StraySafe account is ready: set your password", text, html_body)


def send_otp_email(to: str, name: Optional[str], code: str, minutes: int = 5) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    text = (
        f"{greeting}\n\n"
        f"Your StraySafe verification code is: {code}\n\n"
        f"It expires in {minutes} minutes. If you didn't try to sign in or register, you can ignore this email.\n\n"
        "— StraySafe"
    )
    safe_greeting = html.escape(greeting)
    html_body = f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1208">
  <h2 style="margin:0 0 4px;color:#F97316">StraySafe</h2>
  <p style="margin:0 0 20px;color:#9c8670;font-size:13px">Account verification</p>
  <p>{safe_greeting}</p>
  <p>Your verification code is:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px;text-align:center;margin:16px 0">{code}</p>
  <p style="font-size:13px;color:#555">It expires in {minutes} minutes. Never share this code with anyone, including StraySafe staff.</p>
  <p style="font-size:13px;color:#555">If you didn't try to sign in or register, you can ignore this email.</p>
</div>"""
    return send_email(to, f"Your StraySafe verification code: {code}", text, html_body)


def send_activation_invitation_email(
    to: str,
    name: Optional[str],
    link: str,
    hours: int,
    help_contact: Optional[str] = None,
    subdivision_name: Optional[str] = None,
) -> bool:
    """The invitation to claim a StraySafe resident account. The link is the only secret in it; no password is ever emailed."""
    greeting = f"Hi {name}," if name else "Hi,"
    help_line = help_contact or "your Subdivision Leader"
    sub_label = subdivision_name.strip() if subdivision_name and subdivision_name.strip() else "your subdivision"
    text = (
        f"{greeting}\n\n"
        f"Welcome to STRAYSAFE. Your Subdivision Leader for {sub_label} has prepared a resident account for you "
        "using the details on the official resident list.\n\n"
        "To claim and activate your account, open this link and choose your own password:\n\n"
        f"    {link}\n\n"
        f"This link works once and expires in {hours} hours. If it has expired, open it again to request a new one.\n"
        f"If this email is not meant for you, or your details are wrong, contact {help_line}. Never share this link.\n\n"
        "— STRAYSAFE"
    )
    safe_greeting = html.escape(greeting)
    safe_link = html.escape(link, quote=True)
    safe_help = html.escape(help_line)
    safe_sub = html.escape(sub_label)
    html_body = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f6f4ef;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1c1917;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f6f4ef;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e7e2da;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(28,25,23,0.05);">
          <tr>
            <td style="height:5px;background:linear-gradient(90deg,#b45309,#f97316);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #f0ece4;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <span style="display:inline-block;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#b45309;">STRAYSAFE</span>
                    <span style="display:block;margin-top:3px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#78716c;">Resident Account Activation</span>
                  </td>
                  <td align="right" valign="top">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:#fff7ed;border:1px solid #fed7aa;font-size:11px;font-weight:600;color:#b45309;">Official Invitation</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 24px;">
              <p style="margin:0 0 14px;font-size:16px;font-weight:600;color:#1c1917;">{safe_greeting}</p>
              <p style="margin:0 0 18px;font-size:14.5px;line-height:1.6;color:#44403c;">
                Welcome to <strong>STRAYSAFE</strong>. Your Subdivision Leader for <strong>{safe_sub}</strong> has prepared your resident account from the official subdivision resident list.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background-color:#faf8f5;border:1px solid #ede7de;border-radius:12px;">
                <tr>
                  <td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#57534e;">
                    <strong style="display:block;margin-bottom:4px;color:#1c1917;">How to activate your account:</strong>
                    1. Click <strong>Claim My Account</strong> below.<br>
                    2. Create your own secure password.<br>
                    3. Sign in to submit reports, register pets, and receive community updates.
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" bgcolor="#b45309" style="border-radius:10px;">
                    <a href="{safe_link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 26px;font-size:14.5px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;background-color:#b45309;">Claim My Account</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#57534e;">
                <strong>Single-use link:</strong> This invitation works once and expires in <strong>{hours} hours</strong>. If it has expired, open the link to request a fresh invitation.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.55;color:#57534e;">
                If this email was not intended for you or your details need correction, please contact {safe_help}. Never share this link with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 24px;background-color:#faf8f5;border-top:1px solid #f0ece4;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#78716c;">Button not working? Copy and paste this link into your browser:</p>
              <p style="margin:0;font-size:12px;line-height:1.45;word-break:break-all;">
                <a href="{safe_link}" target="_blank" rel="noopener noreferrer" style="color:#b45309;text-decoration:underline;">{safe_link}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return send_email(to, "Claim your STRAYSAFE resident account", text, html_body)


def _plain_notice(title: str, greeting: str, paragraphs: list) -> str:
    body = "".join(f"<p>{html.escape(p)}</p>" for p in paragraphs)
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1208">
  <h2 style="margin:0 0 4px;color:#F97316">StraySafe</h2>
  <p style="margin:0 0 20px;color:#9c8670;font-size:13px">{html.escape(title)}</p>
  <p>{html.escape(greeting)}</p>
  {body}
</div>"""


def send_residency_approved_email(to: str, name: Optional[str], login_url: Optional[str] = None) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    lines = ["Your residency has been verified and your StraySafe account is approved.",
             "Your account will become Active automatically once you sign in for the first time with your email and the password you created."]
    if login_url:
        lines.append(f"Sign in here: {login_url}")
    text = greeting + "\n\n" + "\n\n".join(lines) + "\n\n— StraySafe"
    return send_email(to, "Your StraySafe account is approved", text, _plain_notice("Account approved", greeting, lines))


def send_account_suspended_email(to: str, name: Optional[str], reason: Optional[str] = None) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    lines = [
        "Your StraySafe resident account has been suspended by your Subdivision Administrator.",
        "You will not be able to sign in or access resident features while your account is suspended.",
    ]
    if reason:
        lines.append(f"Reason: {reason}")
    lines.append("Please contact your Subdivision Administrator for assistance.")
    text = greeting + "\n\n" + "\n\n".join(lines) + "\n\n— StraySafe"
    return send_email(to, "Your StraySafe account has been suspended", text, _plain_notice("Account suspended", greeting, lines))


def send_residency_rejected_email(to: str, name: Optional[str], reason: str, login_url: Optional[str] = None) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    lines = ["Your StraySafe registration could not be approved after residency verification.",
             f"Reason: {reason}",
             "If some of your details were wrong, sign in to correct them and ask for another review. "
             "If you need help, contact your Subdivision Leader."]
    if login_url:
        lines.append(f"Sign in here: {login_url}")
    text = greeting + "\n\n" + "\n\n".join(lines) + "\n\n— StraySafe"
    return send_email(to, "Your StraySafe registration needs attention", text, _plain_notice("Registration not approved", greeting, lines))
