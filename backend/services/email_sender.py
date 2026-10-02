"""Sending the short codes used for email verification and password reset.

``SMTP_HOST`` set → real email over SMTP (works with Gmail app passwords,
SendGrid, Brevo, Resend, Mailgun, ...). Otherwise the message is written to the
server log so the app can be developed and demoed without any mail account.
The log fallback prints the code: it is for development only.
"""

from __future__ import annotations

import html as html_lib
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Protocol

logger = logging.getLogger(__name__)


class EmailSender(Protocol):
    def send(self, to: str, subject: str, text: str, html: str | None = None) -> None: ...


class ConsoleEmailSender:
    def send(self, to: str, subject: str, text: str, html: str | None = None) -> None:
        logger.warning("[DEV EMAIL — set SMTP_HOST to send real mail]\nTo: %s\nSubject: %s\n\n%s", to, subject, text)


class SmtpEmailSender:
    def __init__(self, *, host: str, port: int, username: str | None, password: str | None, sender: str, use_ssl: bool) -> None:
        self.host, self.port, self.username, self.password, self.sender, self.use_ssl = host, port, username, password, sender, use_ssl

    @classmethod
    def from_environment(cls) -> "SmtpEmailSender | None":
        host = os.environ.get("SMTP_HOST", "").strip()
        if not host:
            return None
        port = int(os.environ.get("SMTP_PORT", "587"))
        return cls(
            host=host,
            port=port,
            username=os.environ.get("SMTP_USER") or None,
            password=os.environ.get("SMTP_PASSWORD") or None,
            sender=os.environ.get("EMAIL_FROM") or os.environ.get("SMTP_USER") or "HissabAI <no-reply@localhost>",
            use_ssl=port == 465,
        )

    def send(self, to: str, subject: str, text: str, html: str | None = None) -> None:
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = self.sender, to, subject
        message.set_content(text)
        if html:
            message.add_alternative(html, subtype="html")
        context = ssl.create_default_context()
        if self.use_ssl:
            server: smtplib.SMTP = smtplib.SMTP_SSL(self.host, self.port, timeout=15, context=context)
        else:
            server = smtplib.SMTP(self.host, self.port, timeout=15)
        with server:
            if not self.use_ssl:
                server.starttls(context=context)
            if self.username:
                server.login(self.username, self.password or "")
            server.send_message(message)


def build_sender() -> EmailSender:
    return SmtpEmailSender.from_environment() or ConsoleEmailSender()


def send_safely(sender: EmailSender, to: str, subject: str, text: str, html: str | None = None) -> None:
    """Never let a mail failure surface to (or change the response for) the caller."""
    try:
        sender.send(to, subject, text, html)
    except Exception:  # noqa: BLE001
        logger.exception("Could not send email to %s", to)


def code_email(purpose: str, name: str, code: str, minutes: int) -> tuple[str, str, str]:
    """(subject, text, html) for a verification or reset code."""
    if purpose == "verify_email":
        subject, lead = "Your HissabAI verification code", "Use this code to verify your email address:"
    else:
        subject, lead = "Your HissabAI password reset code", "Use this code to reset your password:"
    first = name.strip().split(" ")[0] or "there"
    text = (
        f"Hi {first},\n\n{lead}\n\n    {code}\n\n"
        f"It expires in {minutes} minutes. If you didn't ask for this, you can ignore this email.\n\n— HissabAI"
    )
    first_html = html_lib.escape(first)
    html = (
        f"<p>Hi {first_html},</p><p>{lead}</p>"
        f"<p style='font-size:28px;letter-spacing:6px;font-weight:700'>{code}</p>"
        f"<p>It expires in {minutes} minutes. If you didn't ask for this, you can ignore this email.</p><p>— HissabAI</p>"
    )
    return subject, text, html
