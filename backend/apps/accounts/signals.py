"""
Accounts signals.

1. Creates a HealthProfile for every new User automatically.
2. Sends a WELCOME notification when onboarding is marked complete.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import User

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User)
def create_health_profile(sender, instance: User, created: bool, **kwargs) -> None:
    """Create a HealthProfile when a User is first saved."""
    if not created:
        return
    try:
        from apps.profiles.models import HealthProfile

        HealthProfile.objects.get_or_create(
            user=instance,
            defaults={"full_name": instance.name or ""},
        )
        logger.info("HealthProfile created for user %s", instance.id)
    except Exception:
        logger.exception("Failed to create HealthProfile for user %s", instance.id)


@receiver(post_save, sender=User)
def welcome_notification_on_onboarding(
    sender, instance: User, created: bool, **kwargs
) -> None:
    """
    Fire a WELCOME notification the moment a user marks onboarding complete.

    We detect the transition by checking update_fields: the onboarding view
    saves only ["onboarded"], so we only fire on that specific save, not on
    every subsequent user update.
    """
    if created:
        return
    update_fields = kwargs.get("update_fields") or set()
    if "onboarded" not in update_fields:
        return
    if not instance.onboarded:
        return
    try:
        from apps.notifications.models import Notification
        from apps.notifications.utils import notify

        name = instance.name.split()[0] if instance.name else "there"
        notify(
            user=instance,
            kind=Notification.Kind.WELCOME,
            title=f"Welcome to myHealthLog, {name}!",
            body=(
                "Your health record is set up and ready. "
                "Add records, share with your doctor, or set up your emergency card."
            ),
            data={"link": "/app"},
        )
    except Exception:
        logger.exception("Failed to send welcome notification for user %s", instance.id)
