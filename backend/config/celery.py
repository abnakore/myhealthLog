"""
Celery application initialisation for myHealthLog.

This module is imported by config/__init__.py so Celery is ready before
Django's app registry loads. Tasks use @shared_task so they decouple
cleanly from the app instance.
"""

import os

from celery import Celery
from celery.signals import setup_logging

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")


@setup_logging.connect
def _use_django_logging(**kwargs):
    """
    Let Django's LOGGING dict own the worker's logging.

    Without this, Celery hijacks the root logger and redirects stdout/stderr
    into a logging proxy *after* Django's StreamHandlers have been bound to
    them, so every worker log line (including startup errors and the reason
    the worker exits) loops back into the proxy and is silently dropped.
    """
    from logging.config import dictConfig

    from django.conf import settings

    dictConfig(settings.LOGGING)


app = Celery("myhealthlog")
app.config_from_object("django.conf:settings", namespace="CELERY")

# Autodiscover tasks in every installed app's tasks.py
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Development-only task to verify the worker is alive."""
    print(f"Request: {self.request!r}")
