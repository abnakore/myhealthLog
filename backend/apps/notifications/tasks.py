"""Celery autodiscovery entry point for the notifications app."""

from .emails import send_email_task  # noqa: F401  (registers notifications.send_email)
