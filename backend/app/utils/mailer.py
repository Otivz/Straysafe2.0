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
