"""
ASGI config for myHealthLog. Used by Uvicorn if async support is needed.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

application = get_asgi_application()
