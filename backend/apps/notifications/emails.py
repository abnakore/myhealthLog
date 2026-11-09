"""
Transactional email for myHealthLog.

Every email goes through `send_email()`, which queues the Celery task
`notifications.send_email` after the current transaction commits, so a slow
SMTP server never delays an API response and a rolled-back action never sends
mail. If the broker is unreachable the email is sent inline instead of being
lost.

Emails are plain text with a light HTML alternative. They never contain health
data — only who did what and a link back into the app, because email is not a
secure channel.
"""

from __future__ import annotations

import logging
from html import escape

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction

logger = logging.getLogger(__name__)


def app_url(path: str = "") -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost").rstrip("/")
    return f"{base}/{path.lstrip('/')}" if path else base


def _html(heading: str, paragraphs: list[str], button: tuple[str, str] | None) -> str:
    body = "".join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2a2e">{escape(p)}</p>'
        for p in paragraphs
    )
    cta = ""
    if button:
        label, href = button
        cta = (
            f'<p style="margin:22px 0 8px"><a href="{escape(href)}" '
            'style="display:inline-block;background:#0f6b5c;color:#ffffff;text-decoration:none;'
            f'font-weight:600;padding:11px 20px;border-radius:999px;font-size:15px">{escape(label)}</a></p>'
            f'<p style="margin:0;font-size:12px;color:#6b7a7e">Or open: {escape(href)}</p>'
        )
    return (
        '<div style="background:#f4f6f5;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">'
        '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px 26px">'
        '<p style="margin:0 0 18px;font-weight:700;color:#0f6b5c;font-size:14px">myHealthLog</p>'
        f'<h1 style="margin:0 0 16px;font-size:20px;color:#1f2a2e">{escape(heading)}</h1>'
        f"{body}{cta}"
        '<hr style="border:none;border-top:1px solid #e3e8e6;margin:26px 0 14px">'
        '<p style="margin:0;font-size:12px;color:#6b7a7e">You are receiving this because of activity '
        "on a myHealthLog account. We never put health information in email.</p>"
        "</div></div>"
    )


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="notifications.send_email",
)
def send_email_task(self, to: list[str], subject: str, text: str, html: str | None = None) -> None:
    message = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=to,
    )
    if html:
        message.attach_alternative(html, "text/html")
    try:
        message.send(fail_silently=False)
    except Exception as exc:
        logger.warning("Email '%s' to %s failed (attempt %s): %s", subject, to, self.request.retries + 1, exc)
        raise self.retry(exc=exc) from exc
    logger.info("Email '%s' sent to %s", subject, to)


def send_email(
    to: str | list[str],
    subject: str,
    heading: str,
    paragraphs: list[str],
    button: tuple[str, str] | None = None,
) -> None:
    """Queue one email. Never raises — email must not break the action that sent it."""
    recipients = [to] if isinstance(to, str) else list(to)
    recipients = [r for r in recipients if r]
    if not recipients:
        return
    text = "\n\n".join(paragraphs)
    if button:
        text += f"\n\n{button[0]}: {button[1]}"
    text += "\n\n— myHealthLog"
    html = _html(heading, paragraphs, button)

    def _dispatch():
        try:
            send_email_task.delay(recipients, subject, text, html)
        except Exception:
            # Broker down: send now rather than drop the email.
            logger.warning("Email queue unavailable, sending '%s' inline", subject)
            try:
                send_email_task.apply(args=(recipients, subject, text, html))
            except Exception:
                logger.exception("Email '%s' to %s could not be sent", subject, recipients)

    try:
        transaction.on_commit(_dispatch)
    except Exception:
        logger.exception("Could not schedule email '%s'", subject)
