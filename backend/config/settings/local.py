"""
Local / development settings. Never use in production.
"""

from decouple import config as env

from .base import *

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Dev-only apps
INSTALLED_APPS += ["debug_toolbar", "django_extensions"]
MIDDLEWARE.insert(0, "debug_toolbar.middleware.DebugToolbarMiddleware")

INTERNAL_IPS = ["127.0.0.1", "0.0.0.0"]

# Use the configured SMTP account when one exists, so password-reset email
# actually leaves the app in development. Without credentials, print to logs.
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if env("EMAIL_HOST", default="") and env("EMAIL_HOST_USER", default="")
    else "django.core.mail.backends.console.EmailBackend"
)

# Allow all CORS origins locally
CORS_ALLOW_ALL_ORIGINS = True

# Faster password hashing in dev (not for production)
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# No throttling in dev
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []

# Debug toolbar: on for Django's own pages (admin, browsable views), never on
# the API. It injects itself into any HTML response, which would end up inside
# downloaded files such as the clinical summary export.
DEBUG_TOOLBAR_CONFIG = {"SHOW_TOOLBAR_CALLBACK": lambda request: not request.path.startswith("/api/")}
