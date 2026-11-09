"""
Test settings. Fast, isolated, no real external calls.
"""

from .base import *

DEBUG = False

# Override the database to use SQLite for isolated, fast tests.
# base.py reads env vars for PostgreSQL; tests don't have that service.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# No real Gemini calls in tests
GEMINI_API_KEY = "test-key"

# Use in-memory storage for tests
DEFAULT_FILE_STORAGE = "django.core.files.storage.InMemoryStorage"

MEDIA_ROOT = "/tmp/mhl_test_media"

# Views that set their own throttle_classes (auth, provider access, emergency)
# still look their rate up here; make it unreachable so tests never hit it.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    key: "100000/min" for key in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
}

# Files are streamed by Django in tests (no Nginx in front).
FILE_X_ACCEL_PREFIX = ""
