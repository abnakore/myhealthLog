# 🏗️ Master Backend Engineering Guide

## Production-Ready Django REST Framework Architecture & Development Blueprint

> **Purpose**: This is a comprehensive, project-agnostic engineering guide for building production-grade Django backends. Use it as a **master prompt for AI agents**, a **personal development blueprint**, or a **team onboarding document**. It defines the standard way we build, test, secure, and deploy Django REST APIs.

---

## 📋 Table of Contents

1. [Core Philosophy & Engineering Principles](#1-core-philosophy--engineering-principles)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure & Organization](#3-project-structure--organization)
4. [Development Environment Setup](#4-development-environment-setup)
5. [Django Project Configuration](#5-django-project-configuration)
6. [Application Architecture](#6-application-architecture)
7. [Model Design Standards](#7-model-design-standards)
8. [Serializer Design Standards](#8-serializer-design-standards)
9. [View & ViewSet Standards](#9-view--viewset-standards)
10. [URL Routing & API Versioning](#10-url-routing--api-versioning)
11. [Authentication & Authorization](#11-authentication--authorization)
12. [Permissions System](#12-permissions-system)
13. [Validation Strategy](#13-validation-strategy)
14. [Error Handling Architecture](#14-error-handling-architecture)
15. [Database Design & Query Optimization](#15-database-design--query-optimization)
16. [File & Media Management](#16-file--media-management)
17. [Asynchronous Tasks with Celery](#17-asynchronous-tasks-with-celery)
18. [Caching Strategy](#18-caching-strategy)
19. [API Documentation](#19-api-documentation)
20. [Testing Strategy](#20-testing-strategy)
21. [Code Quality & Standards](#21-code-quality--standards)
22. [Logging & Observability](#22-logging--observability)
23. [Security Best Practices](#23-security-best-practices)
24. [Performance Optimization](#24-performance-optimization)
25. [Containerization & Docker](#25-containerization--docker)
26. [Deployment & Production Readiness](#26-deployment--production-readiness)
27. [CI/CD Pipeline](#27-cicd-pipeline)
28. [Development Workflow & Git Standards](#28-development-workflow--git-standards)
29. [Documentation Standards](#29-documentation-standards)
30. [Appendix: Quick Start Template & Checklists](#30-appendix-quick-start-template--checklists)

---

## 1. Core Philosophy & Engineering Principles

### 1.1 Design Principles

| Principle | Description | Practical Application |
|-----------|-------------|----------------------|
| **Separation of Concerns** | Each module, app, and class has one clear responsibility | One Django app per domain (`accounts`, `billing`, `inventory`) |
| **Single Responsibility Principle** | A class should have only one reason to change | Split fat serializers into read/write serializers |
| **DRY (Don't Repeat Yourself)** | Extract common logic into base classes/mixins | Use `BaseModel`, `BaseSerializer`, custom mixins |
| **KISS (Keep It Simple, Stupid)** | Solve the problem at hand; avoid premature abstraction | Don't build a plugin system for a 3-endpoint API |
| **YAGNI (You Aren't Gonna Need It)** | Don't build features you don't need yet | Skip "future-proofing" fields with no current use |
| **Convention over Configuration** | Follow Django/DRF conventions unless there's a compelling reason | Use `ModelViewSet` before writing raw `APIView` |
| **Fail Fast** | Validate early; surface errors at the boundary | `serializer.is_valid(raise_exception=True)` |
| **Explicit over Implicit** | Code should be self-documenting; avoid magic | Explicit imports, explicit field lists in serializers |
| **Composition over Inheritance** | Prefer mixins and composition to deep inheritance trees | `class MyView(LoggingMixin, PermissionMixin, ModelViewSet)` |
| **Security by Default** | Secure settings, permissions, and validation are the default | `DEFAULT_PERMISSION_CLASSES = [IsAuthenticated]` |

### 1.2 Development Principles

- **Test-First / Test-Alongside**: Every feature ships with tests. No exceptions.
- **Documentation as Code**: Docstrings explain *why*, type hints explain *what*.
- **Consistency Above Cleverness**: A predictable codebase beats a clever one.
- **Small, Focused PRs**: Each pull request does one thing well.
- **Observability from Day One**: Structured logs, health checks, and metrics are not afterthoughts.
- **Idempotency**: Design operations (especially background tasks and webhooks) to be safely retried.
- **Backward Compatibility**: API changes follow a deprecation path; never break consumers silently.

### 1.3 Non-Negotiable Rules (The "Always" List)

1. **Always** use environment variables for secrets — never hardcode.
2. **Always** run migrations in CI before merging.
3. **Always** write tests for every new endpoint (minimum: happy path + auth failure + validation failure).
4. **Always** use `transaction.atomic` for multi-step write operations.
5. **Always** return consistent error envelopes across the API.
6. **Always** validate file uploads (type, size, content).
7. **Always** index fields used in filters, ordering, or lookups.
8. **Always** paginate list endpoints.
9. **Always** set `permission_classes` explicitly on every view — never rely on defaults alone.
10. **Always** document every custom action with a docstring.

### 1.4 The "Never" List

1. **Never** commit `.env` files, secrets, or credentials.
2. **Never** use `objects.all()` without considering pagination and performance.
3. **Never** perform blocking I/O (email, external API calls) in request/response cycle — use Celery.
4. **Never** trust client input — validate at model *and* serializer level.
5. **Never** expose internal IDs, stack traces, or SQL errors in production responses.
6. **Never** use `DEBUG = True` in production.
7. **Never** delete data without a soft-delete or backup strategy for critical models.
8. **Never** bypass the ORM with raw SQL unless profiling proves it necessary.
9. **Never** merge code with failing tests or below-threshold coverage.
10. **Never** couple business logic tightly to views — extract into services or model methods.

---

## 2. Technology Stack

### 2.1 Backend Core

| Category | Tool | Minimum Version | Purpose |
|----------|------|-----------------|---------|
| **Language** | Python | 3.12+ | Runtime |
| **Framework** | Django | 5.0+ | Web framework |
| **API Layer** | Django REST Framework | 3.15+ | RESTful API |
| **Database** | PostgreSQL | 16+ | Primary data store |
| **DB Driver** | psycopg[binary] | 3.1+ | PostgreSQL adapter (psycopg3) |
| **Auth** | djangorestframework-simplejwt | 5.3+ | JWT authentication |
| **CORS** | django-cors-headers | 4.3+ | Cross-origin requests |
| **Filtering** | django-filter | 24.0+ | Query filtering |
| **Env Management** | python-decouple / django-environ | 3.8+ / 0.11+ | Environment variables |
| **DB URL Parsing** | dj-database-url | 2.1+ | `DATABASE_URL` support |
| **Image Processing** | Pillow | 10.0+ | Image handling |

### 2.2 Asynchronous & Background Processing

| Category | Tool | Minimum Version | Purpose |
|----------|------|-----------------|---------|
| **Task Queue** | Celery | 5.3+ | Background tasks |
| **Broker/Cache** | Redis | 7+ | Celery broker + caching |
| **Scheduler** | django-celery-beat | 2.6+ | Database-backed periodic tasks |
| **Result Backend** | django-celery-results | 2.5+ | Task result storage |

### 2.3 API & Documentation

| Category | Tool | Minimum Version | Purpose |
|----------|------|-----------------|---------|
| **Schema Generation** | drf-spectacular | 0.27+ | OpenAPI 3.0 schema |
| **Interactive Docs** | drf-spectacular (Swagger UI / Redoc) | — | API exploration |

### 2.4 Development & Quality

| Category | Tool | Minimum Version | Purpose |
|----------|------|-----------------|---------|
| **Testing** | pytest | 8.0+ | Test runner |
| **Django Testing** | pytest-django | 4.8+ | Django integration |
| **Coverage** | pytest-cov | 5.0+ | Coverage reporting |
| **Factory** | factory-boy | 3.3+ | Test data factories |
| **Linting** | Ruff | 0.5+ | Lint + format (replaces flake8/isort/black) |
| **Type Checking** | mypy | 1.10+ | Static type checking |
| **Django Types** | django-stubs | 5.0+ | Django type stubs |
| **DRF Types** | djangorestframework-stubs | 3.15+ | DRF type stubs |
| **Pre-commit** | pre-commit | 3.7+ | Git hooks |
| **Debug Toolbar** | django-debug-toolbar | 4.4+ | Dev query inspection |
| **Shell Plus** | django-extensions | 3.2+ | Enhanced dev tooling |

### 2.5 Infrastructure

| Category | Tool | Minimum Version | Purpose |
|----------|------|-----------------|---------|
| **Containerization** | Docker | 24+ | Container runtime |
| **Orchestration** | Docker Compose | 2.20+ | Local multi-service |
| **Web Server** | Gunicorn | 22+ | WSGI server |
| **ASGI Server** | Uvicorn | 0.30+ | ASGI server (if async) |
| **Reverse Proxy** | Nginx | 1.25+ | TLS, static files, proxy |
| **Version Control** | Git | 2.40+ | Source control |
| **CI/CD** | GitHub Actions / GitLab CI | — | Automation |

---

## 3. Project Structure & Organization

### 3.1 Standard Directory Layout

```
backend/
├── apps/                          # All Django applications live here
│   ├── core/                      # Shared utilities, base classes, mixins
│   │   ├── __init__.py
│   │   ├── models.py              # BaseModel, SoftDeleteModel, TimeStampedModel
│   │   ├── serializers.py         # BaseSerializer, mixins
│   │   ├── views.py               # BaseViewSet, mixins
│   │   ├── pagination.py          # Custom pagination classes
│   │   ├── permissions.py         # Shared permission classes
│   │   ├── exceptions.py          # Custom exception classes
│   │   ├── validators.py          # Shared validators
│   │   ├── services.py            # Base service classes
│   │   ├── utils.py               # Utility functions
│   │   └── tests/
│   │       └── __init__.py
│   │
│   ├── accounts/                  # Authentication & user management
│   │   ├── __init__.py
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── managers.py            # Custom UserManager
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   ├── signals.py
│   │   ├── services.py
│   │   ├── tasks.py
│   │   ├── tests/
│   │   │   ├── __init__.py
│   │   │   ├── test_models.py
│   │   │   ├── test_serializers.py
│   │   │   ├── test_views.py
│   │   │   └── test_services.py
│   │   └── migrations/
│   │       └── __init__.py
│   │
│   ├── <domain_app_1>/            # e.g., billing
│   ├── <domain_app_2>/            # e.g., inventory
│   └── <domain_app_3>/            # e.g., notifications
│
├── config/                        # Project configuration (renamed from project_name/)
│   ├── __init__.py
│   ├── celery.py                  # Celery app initialization
│   ├── asgi.py
│   ├── wsgi.py
│   ├── urls.py                    # Root URL configuration
│   └── settings/
│       ├── __init__.py
│       ├── base.py                # Shared settings
│       ├── local.py               # Development overrides
│       ├── staging.py             # Staging overrides
│       ├── production.py          # Production overrides
│       └── test.py                # Test-specific settings
│
├── requirements/
│   ├── base.txt                   # Core dependencies
│   ├── local.txt                  # Base + dev dependencies
│   ├── production.txt             # Base + production dependencies
│   └── test.txt                   # Base + test dependencies
│
├── templates/                     # HTML templates (emails, admin overrides)
├── locale/                        # Translation files
├── mediafiles/                    # User-uploaded files (gitignored)
├── staticfiles/                   # Collected static files (gitignored)
├── logs/                          # Application logs (gitignored)
│
├── .env.example                   # Environment variable template
├── .env                           # Actual env vars (gitignored)
├── .gitignore
├── .dockerignore
├── manage.py
├── Dockerfile                     # Development Dockerfile
├── Dockerfile.prod                # Production Dockerfile
├── docker-compose.yml             # Development compose
├── docker-compose.prod.yml        # Production compose
├── entrypoint.sh                  # Container entrypoint script
└── README.md
```

### 3.2 App Naming Convention

- **Plural nouns** for domain apps: `accounts`, `orders`, `products`, `notifications`.
- **Singular for infrastructure apps**: `core`, `utils`.
- **Never** use Django's default `myapp` naming.
- Each app = one bounded context. If an app has more than ~15 models, consider splitting.

### 3.3 App Creation Command

```bash
docker-compose exec backend python manage.py startapp <app_name> apps/<app_name>
```

Then update `apps/<app_name>/apps.py`:

```python
from django.apps import AppConfig


class <AppName>Config(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.<app_name>"
    verbose_name = "<Human Readable Name>"

    def ready(self):
        # Import signals here to ensure they're registered
        from . import signals  # noqa: F401
```

And in `config/settings/base.py`:

```python
INSTALLED_APPS = [
    # ...
    "apps.<app_name>",
]
```

---

## 4. Development Environment Setup

### 4.1 Prerequisites

- Docker Desktop 24+
- Docker Compose 2.20+
- Git 2.40+
- Python 3.12+ (for local tooling, not required if using Docker for everything)
- Node.js 20+ (if frontend is in the same repo)
- VS Code with recommended extensions

### 4.2 Recommended VS Code Extensions

| Extension | Purpose |
|-----------|---------|
| Python | Language support |
| Pylance | Type checking |
| Ruff | Linting/formatting |
| Django | Template support |
| Docker | Container management |
| GitLens | Git history |
| Even Better TOML | `pyproject.toml` support |
| DotENV | `.env` syntax highlighting |

### 4.3 Environment File Template (`.env.example`)

```env
# ==============================
# Django Core
# ==============================
DJANGO_SECRET_KEY=change-me-to-a-long-random-string
DJANGO_DEBUG=True
DJANGO_SETTINGS_MODULE=config.settings.local
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
DJANGO_LOG_LEVEL=INFO

# ==============================
# Database
# ==============================
DATABASE_URL=postgres://postgres:postgres@db:5432/app_db
DB_NAME=app_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=db
DB_PORT=5432

# ==============================
# Cache & Broker
# ==============================
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# ==============================
# JWT
# ==============================
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

# ==============================
# CORS / CSRF
# ==============================
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://localhost:3000

# ==============================
# Email
# ==============================
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=noreply@example.com

# ==============================
# Frontend
# ==============================
FRONTEND_URL=http://localhost:5173

# ==============================
# External Services
# ==============================
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=
AWS_S3_REGION_NAME=
SENTRY_DSN=
```

### 4.4 Bootstrap Sequence

```bash
# 1. Clone repo
git clone <repo-url> && cd backend

# 2. Copy env template
cp .env.example .env
# Edit .env with your local values

# 3. Build and start services
docker-compose up --build -d

# 4. Run migrations
docker-compose exec backend python manage.py migrate

# 5. Create superuser
docker-compose exec backend python manage.py createsuperuser

# 6. Verify
curl http://localhost:8000/api/health/
# → {"status": "ok"}
```

---

## 5. Django Project Configuration

### 5.1 Settings Package Structure

Settings are **split by environment** to prevent production misconfiguration.

**`config/settings/base.py`** — shared across all environments:

```python
"""
Base settings shared across all environments.
Never import environment-specific settings here.
"""
from datetime import timedelta
from pathlib import Path

import dj_database_url
from decouple import Csv, config

# -------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# -------------------------------------------------------------------
# Security
# -------------------------------------------------------------------
SECRET_KEY = config("DJANGO_SECRET_KEY")
DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="", cast=Csv())

# -------------------------------------------------------------------
# Applications
# -------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "django_celery_beat",
    "django_celery_results",
]

LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    # ... add domain apps here
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# -------------------------------------------------------------------
# Middleware
# -------------------------------------------------------------------
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",          # must be before CommonMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.RequestIDMiddleware",       # custom: request tracing
]

# -------------------------------------------------------------------
# URLs / WSGI
# -------------------------------------------------------------------
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# -------------------------------------------------------------------
# Templates
# -------------------------------------------------------------------
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# -------------------------------------------------------------------
# Database
# -------------------------------------------------------------------
DATABASES = {
    "default": dj_database_url.config(
        default=config("DATABASE_URL"),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# -------------------------------------------------------------------
# Authentication
# -------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# -------------------------------------------------------------------
# Internationalization
# -------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# -------------------------------------------------------------------
# Static & Media
# -------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"] if (BASE_DIR / "static").exists() else []

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "mediafiles"

# -------------------------------------------------------------------
# Django REST Framework
# -------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "user": "1000/hour",
    },
    "DATETIME_FORMAT": "%Y-%m-%dT%H:%M:%SZ",
    "COERCE_DECIMAL_TO_STRING": False,
}

# -------------------------------------------------------------------
# JWT
# -------------------------------------------------------------------
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=config("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", default=60, cast=int)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=config("JWT_REFRESH_TOKEN_LIFETIME_DAYS", default=7, cast=int)
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# -------------------------------------------------------------------
# CORS
# -------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

# -------------------------------------------------------------------
# Celery
# -------------------------------------------------------------------
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default="redis://redis:6379/1")
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="django-db")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

# -------------------------------------------------------------------
# Cache
# -------------------------------------------------------------------
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": config("REDIS_URL", default="redis://redis:6379/0"),
    }
}

# -------------------------------------------------------------------
# Email
# -------------------------------------------------------------------
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="noreply@example.com")

# -------------------------------------------------------------------
# API Documentation
# -------------------------------------------------------------------
SPECTACULAR_SETTINGS = {
    "TITLE": "Project API",
    "DESCRIPTION": "API documentation",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api/",
}

# -------------------------------------------------------------------
# Logging
# -------------------------------------------------------------------
LOG_LEVEL = config("DJANGO_LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {name} {request_id} {message}",
            "style": "{",
        },
        "simple": {"format": "{levelname} {message}", "style": "{"},
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "filters": {
        "request_id": {"()": "apps.core.logging.RequestIDFilter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
            "filters": ["request_id"],
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": BASE_DIR / "logs" / "app.log",
            "maxBytes": 10 * 1024 * 1024,  # 10 MB
            "backupCount": 5,
            "formatter": "verbose",
            "filters": ["request_id"],
        },
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "apps": {"handlers": ["console", "file"], "level": LOG_LEVEL, "propagate": False},
        "celery": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
    },
}
```

**`config/settings/local.py`**:

```python
from .base import *  # noqa: F401, F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Dev-only apps
INSTALLED_APPS += ["debug_toolbar", "django_extensions"]  # noqa: F405
MIDDLEWARE.insert(0, "debug_toolbar.middleware.DebugToolbarMiddleware")  # noqa: F405

INTERNAL_IPS = ["127.0.0.1", "0.0.0.0"]

# Use console email backend in dev
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# CORS: allow everything locally
CORS_ALLOW_ALL_ORIGINS = True

# Faster password hashing in dev
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Disable throttling in dev
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []  # noqa: F405

# Debug toolbar
DEBUG_TOOLBAR_CONFIG = {"SHOW_TOOLBAR_CALLBACK": lambda request: True}
```

**`config/settings/production.py`**:

```python
from .base import *  # noqa: F401, F403

DEBUG = False

# -------------------------------------------------------------------
# Security hardening
# -------------------------------------------------------------------
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"

# -------------------------------------------------------------------
# Static & Media (served by Nginx in prod)
# -------------------------------------------------------------------
STATIC_ROOT = "/app/staticfiles"
MEDIA_ROOT = "/app/mediafiles"

# -------------------------------------------------------------------
# Logging (JSON in prod for log aggregation)
# -------------------------------------------------------------------
LOGGING["handlers"]["console"]["formatter"] = "json"  # noqa: F405

# -------------------------------------------------------------------
# Sentry (optional)
# -------------------------------------------------------------------
SENTRY_DSN = config("SENTRY_DSN", default="")  # noqa: F405
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
        environment="production",
    )
```

**`config/settings/test.py`**:

```python
from .base import *  # noqa: F401, F403

DEBUG = False

# Faster password hashing in tests
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# In-memory cache for tests
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Synchronous Celery in tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Disable throttling in tests
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []  # noqa: F405

# Console email
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
```

### 5.2 Environment Selection

Set `DJANGO_SETTINGS_MODULE` in `.env`:
- Local: `config.settings.local`
- Test (CI): `config.settings.test`
- Staging: `config.settings.staging`
- Production: `config.settings.production`

**Never** set `DJANGO_SETTINGS_MODULE` in `manage.py` — always via environment.

### 5.3 Celery App Initialization

**`config/celery.py`**:

```python
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f"Request: {self.request!r}")
```

**`config/__init__.py`**:

```python
from .celery import app as celery_app

__all__ = ("celery_app",)
```

---

## 6. Application Architecture

### 6.1 Layered Architecture

Every non-trivial feature flows through these layers:

```
HTTP Request
    │
    ▼
┌─────────────┐
│ Middleware  │  (request ID, logging, CORS, auth)
└─────────────┘
    │
    ▼
┌─────────────┐
│    View     │  (HTTP concerns: parse request, return response)
└─────────────┘
    │
    ▼
┌─────────────┐
│ Serializer  │  (I/O validation, representation)
└─────────────┘
    │
    ▼
┌─────────────┐
│  Service    │  (business logic, orchestration, transactions)   ← optional but recommended
└─────────────┘
    │
    ▼
┌─────────────┐
│    Model    │  (data, invariants, DB-level validation)
└─────────────┘
    │
    ▼
┌─────────────┐
│  Database   │
└─────────────┘
```

**Rules:**
- Views **never** contain business logic — they delegate.
- Serializers **never** call external APIs or send emails.
- Models **never** know about HTTP, serializers, or views.
- Services are **the only** place where multi-model orchestration happens.
- Tasks **call services**, not views or serializers.

### 6.2 Service Layer Pattern

Use a service layer for any operation that:
- Touches more than one model
- Calls external services
- Needs `transaction.atomic`
- Has business rules too complex for a serializer

**`apps/core/services.py`** — base service:

```python
"""
Base service class for business logic orchestration.
"""
from django.db import transaction


class BaseService:
    """
    Base class for services.

    Subclasses implement `execute()`. Use `@transaction.atomic` where needed.
    """

    @classmethod
    def execute(cls, *args, **kwargs):
        raise NotImplementedError

    @classmethod
    def run(cls, *args, **kwargs):
        """
        Public entry point. Wraps execute() with transaction + logging.
        """
        with transaction.atomic():
            return cls.execute(*args, **kwargs)
```

**Example service** (`apps/orders/services.py`):

```python
import logging
from decimal import Decimal

from django.db import transaction

from apps.core.services import BaseService
from apps.core.exceptions import BusinessRuleError

from .models import Order, OrderItem
from .tasks import send_order_confirmation_email

logger = logging.getLogger(__name__)


class PlaceOrderService(BaseService):
    """
    Create an order from a cart.

    Business rules:
    - Cart must be non-empty.
    - Each product must be in stock.
    - Stock is decremented atomically.
    - Confirmation email is sent asynchronously.
    """

    @classmethod
    def execute(cls, *, user, cart_items: list[dict]) -> Order:
        if not cart_items:
            raise BusinessRuleError("Cannot place an empty order.")

        order = Order.objects.create(user=user, status=Order.Status.PENDING)

        for item in cart_items:
            product = item["product"]
            quantity = item["quantity"]

            # Lock the row to prevent race conditions
            product = type(product).objects.select_for_update().get(pk=product.pk)
            if product.stock < quantity:
                raise BusinessRuleError(f"Insufficient stock for {product.name}.")

            product.stock -= quantity
            product.save(update_fields=["stock"])

            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                unit_price=product.price,
            )

        order.recalculate_total()
        send_order_confirmation_email.delay(order.id)
        logger.info("Order %s placed by user %s", order.id, user.id)
        return order
```

**Usage in a view:**

```python
class OrderViewSet(viewsets.ModelViewSet):
    @action(detail=False, methods=["post"])
    def place(self, request):
        serializer = PlaceOrderSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order = PlaceOrderService.run(
            user=request.user,
            cart_items=serializer.validated_data["items"],
        )
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)
```

---

## 7. Model Design Standards

### 7.1 Base Models (`apps/core/models.py`)

```python
"""
Abstract base models for all domain models.
"""
import uuid

from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    """
    Abstract base: adds created_at / updated_at.

    created_at is set once on creation; updated_at is refreshed on every save.
    """
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UUIDModel(models.Model):
    """
    Abstract base: uses UUID primary key. Use for public-facing models
    where sequential IDs would leak information.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class SoftDeleteQuerySet(models.QuerySet):
    """QuerySet that filters out soft-deleted rows by default."""

    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def dead(self):
        return self.filter(deleted_at__isnull=False)

    def delete(self):
        """Soft-delete: set deleted_at instead of removing rows."""
        return self.update(deleted_at=timezone.now())

    def hard_delete(self):
        """Permanently remove rows."""
        return super().delete()


class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).alive()


class SoftDeleteModel(models.Model):
    """
    Abstract base: soft-delete support.
    Use `.delete()` for soft delete; `.hard_delete()` for permanent.
    """
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = SoftDeleteManager()
    all_objects = models.Manager()  # includes deleted

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])

    def hard_delete(self, using=None, keep_parents=False):
        super().delete(using=using, keep_parents=keep_parents)


class BaseModel(TimeStampedModel, SoftDeleteModel):
    """
    Standard base model for domain models.
    Provides: created_at, updated_at, soft-delete, common Meta.
    """
    class Meta:
        abstract = True
        ordering = ["-created_at"]
        get_latest_by = "created_at"
```

### 7.2 Model Design Checklist

Every model must satisfy:

- [ ] Inherits from `BaseModel` (or `TimeStampedModel` if soft-delete is not desired).
- [ ] Has a `__str__` method.
- [ ] Declares `Meta.ordering` (deterministic).
- [ ] Declares `Meta.indexes` for filter/order fields.
- [ ] Uses `choices` (or a `TextChoices` subclass) for enum fields.
- [ ] Defines `clean()` for cross-field validation.
- [ ] Handles file cleanup in `save()` and `delete()` if it has `FileField`/`ImageField`.
- [ ] Has docstrings on the class and non-obvious methods.

### 7.3 Field Conventions

| Field | Convention |
|-------|------------|
| **Primary key** | `BigAutoField` (default) or UUID for public-facing models |
| **CharField** | Always set `max_length` — never rely on unbounded |
| **TextField** | Only for genuinely unbounded text (descriptions, HTML) |
| **BooleanField** | Use `default=False` or `default=True`; never `null=True` |
| **DateTimeField** | Use `auto_now_add` / `auto_now` for audit fields; `null=True` only when meaningful |
| **ForeignKey** | Always set `on_delete`, always set `related_name` |
| **ManyToManyField** | Use `blank=True`, and set `related_name` |
| **DecimalField** | Always set `max_digits` and `decimal_places`; never use `FloatField` for money |
| **Enum** | Prefer `models.TextChoices` over `choices=[(...)]` |
| **FileField** | Always set `upload_to` to a callable or namespaced path |
| **JSONField** | Use for genuinely schemaless data; validate shape in `clean()` |

### 7.4 Enum Pattern

```python
class OrderStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PAID = "paid", "Paid"
    SHIPPED = "shipped", "Shipped"
    CANCELLED = "cancelled", "Cancelled"


class Order(BaseModel):
    status = models.CharField(
        max_length=20,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING,
        db_index=True,
    )
```

### 7.5 Related Name Convention

- `related_name="<plural_of_model>"` for FK to owner: `related_name="orders"` on `Order.user`.
- `related_name="<model>_set"` is **not** acceptable — always be explicit.
- For M2M, `related_name="<plural>"` with a `+` if reverse lookup isn't needed.

### 7.6 File Cleanup Pattern

```python
import os


class Document(BaseModel):
    file = models.FileField(upload_to="documents/%Y/%m/")

    def save(self, *args, **kwargs):
        # Delete old file when replacing
        if self.pk:
            try:
                old = type(self).objects.get(pk=self.pk)
                if old.file and old.file != self.file and os.path.isfile(old.file.path):
                    os.remove(old.file.path)
            except type(self).DoesNotExist:
                pass
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.file and os.path.isfile(self.file.path):
            os.remove(self.file.path)
        super().delete(*args, **kwargs)
```

### 7.7 Database Indexes

Add indexes for:
- Fields used in `filter()`, `exclude()`, `order_by()`.
- Foreign keys (Django adds these automatically, but compound indexes may help).
- Fields used in `unique_together` / `UniqueConstraint`.

```python
class Order(BaseModel):
    user = models.ForeignKey(...)
    status = models.CharField(..., db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["-created_at"]),
            models.Index(fields=["status"], name="idx_order_status"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["user", "external_id"], name="uniq_user_external"),
            models.CheckConstraint(check=models.Q(quantity__gte=0), name="quantity_non_negative"),
        ]
```

### 7.8 Manager & QuerySet Pattern

```python
class OrderQuerySet(models.QuerySet):
    def pending(self):
        return self.filter(status=OrderStatus.PENDING)

    def for_user(self, user):
        return self.filter(user=user)

    def with_totals(self):
        return self.annotate(total=models.Sum("items__unit_price"))


class OrderManager(models.Manager.from_queryset(OrderQuerySet)):
    pass


class Order(BaseModel):
    objects = OrderManager()
```

**Rule**: Once you've added 3+ `filter()` calls with the same arguments in views, move them to a manager method.

---

## 8. Serializer Design Standards

### 8.1 Serializer Separation

For every model, prefer **two serializers**:
- `<Model>ReadSerializer` — nested, computed fields, no writes.
- `<Model>WriteSerializer` — validates input, handles writes.

**Why**: Read and write shapes differ (computed fields, nested objects, write-only relations), and combining them produces confusing code.

### 8.2 Read Serializer

```python
class OrderReadSerializer(serializers.ModelSerializer):
    """Read-only representation of an order."""
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    items = OrderItemReadSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    customer_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "status", "status_display", "items", "total",
            "customer_email", "created_at", "updated_at",
        ]
        read_only_fields = fields
```

### 8.3 Write Serializer

```python
class OrderCreateSerializer(serializers.ModelSerializer):
    """Create an order."""
    items = OrderItemCreateSerializer(many=True, write_only=True)
    coupon_code = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Order
        fields = ["items", "coupon_code", "shipping_address_id"]

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Order must contain at least one item.")
        if len(value) > 100:
            raise serializers.ValidationError("Order cannot exceed 100 items.")
        return value

    def validate_coupon_code(self, value):
        if not value:
            return value
        from .services import CouponService
        if not CouponService.is_valid(value):
            raise serializers.ValidationError("Invalid or expired coupon.")
        return value
```

### 8.4 Serializer Conventions

| Rule | Rationale |
|------|-----------|
| Always list fields explicitly — no `__all__` | Explicit > implicit; prevents accidental exposure |
| Never expose raw `id` for public-facing resources — use UUIDs or slugs | Prevent enumeration |
| Use `SerializerMethodField` for computed fields; document with docstrings | Clarity |
| Use `source="..."` to rename fields (`customer_email = EmailField(source="user.email")`) | API stability |
| Handle empty strings for nullable fields in `to_internal_value` | HTML forms send `""` |
| Use `write_only=True` for password fields | Never leak |
| Use `required=False, default=None` for truly optional fields | Clarity |
| Use `allow_null=True` explicitly for nullable fields | Clarity |
| Return lists, never dicts, from `validate_<field>` unless the field itself is a dict | DRF convention |

### 8.5 `to_internal_value` for Nullable Fields

```python
def to_internal_value(self, data):
    """Convert empty strings to None for nullable fields."""
    mutable = data.copy() if hasattr(data, "copy") else dict(data)
    nullable_fields = ["description", "notes", "external_id"]
    for field in nullable_fields:
        if mutable.get(field) == "":
            mutable[field] = None
    return super().to_internal_value(mutable)
```

### 8.6 Nested Writes with M2M

```python
class ProjectCreateSerializer(serializers.ModelSerializer):
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        default=list,
    )

    class Meta:
        model = Project
        fields = ["name", "description", "tag_ids"]

    def validate_tag_ids(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of IDs.")
        existing = set(Tag.objects.filter(id__in=value).values_list("id", flat=True))
        missing = set(value) - existing
        if missing:
            raise serializers.ValidationError(f"Unknown tag IDs: {sorted(missing)}")
        return value

    def create(self, validated_data):
        tag_ids = validated_data.pop("tag_ids", [])
        project = Project.objects.create(**validated_data)
        if tag_ids:
            project.tags.set(tag_ids)
        return project

    def update(self, instance, validated_data):
        tag_ids = validated_data.pop("tag_ids", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if tag_ids is not None:
            instance.tags.set(tag_ids)
        return instance
```

### 8.7 Dynamic Serializer Selection in ViewSets

```python
class OrderViewSet(viewsets.ModelViewSet):
    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return OrderWriteSerializer
        return OrderReadSerializer
```

### 8.8 Serializer Context

Always pass `request` (and user) in context:

```python
def get_serializer_context(self):
    return {
        **super().get_serializer_context(),
        "request": self.request,
        "user": self.request.user,
    }
```

Then in serializers:

```python
class CommentSerializer(serializers.ModelSerializer):
    def create(self, validated_data):
        user = self.context["request"].user
        return Comment.objects.create(user=user, **validated_data)
```

---

## 9. View & ViewSet Standards

### 9.1 ViewSet Hierarchy

Choose the **simplest** view class that does the job:

| Need | Use |
|------|-----|
| Standard CRUD on a model | `ModelViewSet` |
| Read-only list/retrieve | `ReadOnlyModelViewSet` |
| One-off action | `@api_view` or `APIView` (prefer `@api_view` for simple cases) |
| Custom business logic | `APIView` + service layer |

### 9.2 Standard ViewSet

```python
import logging

from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.core.permissions import IsOwnerOrReadOnly

from .models import Order
from .serializers import OrderReadSerializer, OrderWriteSerializer
from .filters import OrderFilter
from .services import PlaceOrderService

logger = logging.getLogger(__name__)


class OrderViewSet(viewsets.ModelViewSet):
    """
    Order endpoints.

    list:   GET    /api/v1/orders/
    create: POST   /api/v1/orders/
    retrieve: GET  /api/v1/orders/{id}/
    update: PUT    /api/v1/orders/{id}/
    partial_update: PATCH /api/v1/orders/{id}/
    destroy: DELETE /api/v1/orders/{id}/
    place:  POST   /api/v1/orders/place/
    cancel: POST   /api/v1/orders/{id}/cancel/
    """
    permission_classes = [IsOwnerOrReadOnly]
    filterset_class = OrderFilter
    search_fields = ["id", "user__email"]
    ordering_fields = ["created_at", "total"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return (
            Order.objects
            .select_related("user")
            .prefetch_related("items__product")
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return OrderWriteSerializer
        return OrderReadSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = PlaceOrderService.run(user=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise DRFValidationError(dict(exc))
        return Response(
            OrderReadSerializer(order).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a pending order. Idempotent."""
        order = self.get_object()
        if order.status not in ("pending", "paid"):
            return Response(
                {"detail": f"Cannot cancel order in status '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = "cancelled"
        order.save(update_fields=["status", "updated_at"])
        logger.info("Order %s cancelled by user %s", order.id, request.user.id)
        return Response(OrderReadSerializer(order).data)
```

### 9.3 ViewSet Rules

| Rule | Rationale |
|------|-----------|
| Docstring lists every endpoint with method + URL | Self-documenting |
| `get_queryset()` always uses `select_related` / `prefetch_related` | Avoid N+1 |
| All writes in `@transaction.atomic` | Atomicity |
| Custom actions use `@action` and have docstrings | Clarity |
| Business logic delegated to services | Testability |
| Exceptions translated: Django → DRF | Consistent error shape |
| Logging on non-trivial operations | Observability |
| Never accept `request.data` directly — always through serializer | Validation |

### 9.4 Filtering

**`apps/orders/filters.py`**:

```python
import django_filters

from .models import Order


class OrderFilter(django_filters.FilterSet):
    """Filter orders by status, user, and creation date."""
    status = django_filters.CharFilter(field_name="status")
    user = django_filters.NumberFilter(field_name="user_id")
    created_after = django_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="lte")
    min_total = django_filters.NumberFilter(field_name="total", lookup_expr="gte")
    max_total = django_filters.NumberFilter(field_name="total", lookup_expr="lte")

    class Meta:
        model = Order
        fields = []
```

### 9.5 Pagination

**`apps/core/pagination.py`**:

```python
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    """Standard pagination: 20 per page, max 100."""
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            "count": self.page.paginator.count,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "page": self.page.number,
            "page_size": self.get_page_size(self.request),
            "results": data,
        })


class LargeResultsSetPagination(StandardResultsSetPagination):
    page_size = 100
    max_page_size = 500
```

**Rule**: Every list endpoint must paginate. Never return unbounded lists.

### 9.6 Custom Actions

```python
@action(detail=False, methods=["get"])
def me(self, request):
    """Return the authenticated user's profile."""
    serializer = UserReadSerializer(request.user)
    return Response(serializer.data)


@action(detail=True, methods=["post"], url_path="send-invoice")
def send_invoice(self, request, pk=None):
    """Queue an invoice email for the given order."""
    order = self.get_object()
    SendInvoiceTask.delay(order.id)
    return Response({"status": "queued"}, status=status.HTTP_202_ACCEPTED)
```

**Rules for custom actions:**
- `detail=False` → operates on collection (`/orders/place/`)
- `detail=True` → operates on a single object (`/orders/{id}/cancel/`)
- Always specify `methods=[...]`
- Always docstring
- Use `url_path` to override the default path (which uses underscores)

---

## 10. URL Routing & API Versioning

### 10.1 Versioning Strategy

**All APIs live under `/api/v1/`.** Why:
- Allows breaking changes in v2 without disrupting clients.
- Explicit versioning from day one costs nothing; adding it later is painful.

### 10.2 Root URL Configuration

**`config/urls.py`**:

```python
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.core.views import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/v1/", include([
        path("auth/", include("apps.accounts.urls")),
        path("orders/", include("apps.orders.urls")),
        # ... add domain apps
    ])),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

### 10.3 App URL Configuration

**`apps/orders/urls.py`**:

```python
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import OrderViewSet

router = DefaultRouter()
router.register(r"", OrderViewSet, basename="orders")

urlpatterns = [
    path("", include(router.urls)),
]
```

### 10.4 URL Naming Conventions

| Resource | URL |
|----------|-----|
| List / create | `GET/POST /api/v1/orders/` |
| Detail | `GET/PUT/PATCH/DELETE /api/v1/orders/{id}/` |
| Custom collection action | `POST /api/v1/orders/place/` |
| Custom detail action | `POST /api/v1/orders/{id}/cancel/` |
| Nested resource | `GET /api/v1/orders/{id}/items/` |

**Rules:**
- Plural nouns for collections (`/orders/`, not `/order/`).
- Trailing slashes **always** (Django's `APPEND_SLASH=True`).
- kebab-case for multi-word paths (`/send-invoice/`, not `/send_invoice/`).
- Never use verbs in resource URLs; use HTTP methods + custom actions for verbs.

### 10.5 Health Check Endpoint

**`apps/core/views.py`**:

```python
from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """
    Health check for load balancers and uptime monitors.
    Returns 200 if the app and database are reachable.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        db_ok = True
    except Exception:
        db_ok = False

    payload = {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "error"}
    code = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return Response(payload, status=code)
```

---

## 11. Authentication & Authorization

### 11.1 Custom User Model

**Always** create a custom user model at project start. Migrating later is painful.

**`apps/accounts/models.py`**:

```python
import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model. Uses email as the login identifier.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["-date_joined"]
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.email

    @property
    def short_name(self):
        return self.full_name.split(" ")[0] if self.full_name else self.email.split("@")[0]
```

**`apps/accounts/managers.py`**:

```python
from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)
```

### 11.2 Auth Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/auth/register/` | POST | Register a user |
| `/api/v1/auth/login/` | POST | Obtain access + refresh tokens |
| `/api/v1/auth/refresh/` | POST | Exchange refresh for access |
| `/api/v1/auth/logout/` | POST | Blacklist refresh token |
| `/api/v1/auth/me/` | GET | Current user profile |
| `/api/v1/auth/password/change/` | POST | Change password |

**`apps/accounts/views.py`** (excerpt):

```python
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import (
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserReadSerializer,
)


class RegisterView(generics.CreateAPIView):
    """Register a new user and return tokens."""
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserReadSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )


class CustomTokenObtainPairView(TokenObtainPairView):
    """Login: returns access + refresh + user profile."""
    serializer_class = CustomTokenObtainPairSerializer


class MeView(APIView):
    """Return the current user's profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserReadSerializer(request.user).data)


class LogoutView(APIView):
    """Blacklist the provided refresh token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh = request.data["refresh"]
            RefreshToken(refresh).blacklist()
        except Exception:
            return Response({"detail": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_205_RESET_CONTENT)
```

### 11.3 JWT Best Practices

| Practice | Value |
|----------|-------|
| Access token lifetime | 15–60 minutes |
| Refresh token lifetime | 7–30 days |
| Rotation | Enabled (`ROTATE_REFRESH_TOKENS=True`) |
| Blacklist after rotation | Enabled (`BLACKLIST_AFTER_ROTATION=True`) |
| Storage (SPA) | `localStorage` or `httpOnly` cookies (trade-offs documented) |
| Storage (mobile) | Secure storage (Keychain / Keystore) |

### 11.4 `last_login_ip` Update

```python
# apps/accounts/serializers.py
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        request = self.context.get("request")
        if request:
            self.user.last_login_ip = get_client_ip(request)
            self.user.save(update_fields=["last_login_ip"])
        data["user"] = UserReadSerializer(self.user).data
        return data


def get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
```

---

## 12. Permissions System

### 12.1 Permission Classes (`apps/core/permissions.py`)

```python
from rest_framework import permissions


class IsAuthenticatedOrReadOnly(permissions.BasePermission):
    """Read for everyone; write requires authentication."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)


class IsOwner(permissions.BasePermission):
    """Only the owner can access the object."""

    def has_object_permission(self, request, view, obj):
        owner = getattr(obj, "owner", None) or getattr(obj, "user", None)
        return owner == request.user


class IsOwnerOrReadOnly(permissions.BasePermission):
    """Read for everyone; write only for the owner."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        owner = getattr(obj, "owner", None) or getattr(obj, "user", None)
        return owner == request.user


class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_staff)


class IsSuperUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class ReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS


class HasRole(permissions.BasePermission):
    """Check if user has any of the given roles."""

    def __init__(self, *roles):
        self.roles = roles

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        user_roles = set(getattr(request.user, "roles", []))
        return bool(user_roles & set(self.roles))
```

### 12.2 Permission Composition

**Rule**: Never write `if request.user.is_staff` in a view. Use permission classes.

```python
class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticatedOrReadOnly]
    # ...
```

For per-action permissions:

```python
class OrderViewSet(viewsets.ModelViewSet):
    def get_permissions(self):
        if self.action in ("destroy", "cancel"):
            return [IsAuthenticated(), IsOwner()]
        if self.action == "list_all":
            return [IsStaff()]
        return [IsAuthenticatedOrReadOnly()]
```

### 12.3 Object-Level Permissions

Object-level permission checks require calling `self.check_object_permissions(request, obj)` — which `get_object()` does automatically. In custom actions, always call `get_object()` (not `Model.objects.get()`), so permissions run.

---

## 13. Validation Strategy

### 13.1 Three Layers of Validation

| Layer | Where | Purpose |
|-------|-------|---------|
| **Field-level** | Model field (`max_length`, `choices`, `null`) | DB integrity |
| **Model-level** | `Model.clean()` | Cross-field invariants |
| **Serializer-level** | `validate()`, `validate_<field>()` | Business rules, user-facing errors |

### 13.2 Model `clean()`

```python
from django.core.exceptions import ValidationError

class Booking(BaseModel):
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()

    def clean(self):
        if self.start_at and self.end_at and self.end_at <= self.start_at:
            raise ValidationError({"end_at": "End time must be after start time."})
```

**Important**: `clean()` is **not called automatically** on `save()` unless you call `full_clean()`. In `BaseModel.save()` you should call `self.full_clean()` (or override per-model). Pick one and be consistent — I recommend calling `full_clean()` in every model's `save()` via `BaseModel`.

### 13.3 Serializer Validation

```python
class BookingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ["id", "start_at", "end_at", "resource_id"]

    def validate(self, attrs):
        start = attrs.get("start_at")
        end = attrs.get("end_at")
        if start and end and end <= start:
            raise serializers.ValidationError({"end_at": "End must be after start."})
        # Check for overlapping bookings
        overlap = Booking.objects.filter(
            resource_id=attrs["resource_id"],
            start_at__lt=end,
            end_at__gt=start,
        ).exclude(pk=self.instance.pk if self.instance else None)
        if overlap.exists():
            raise serializers.ValidationError("Overlaps an existing booking.")
        return attrs
```

### 13.4 Reusable Validators

**`apps/core/validators.py`**:

```python
import os

from django.core.exceptions import ValidationError


def validate_file_size(max_bytes: int):
    """Return a validator that enforces a file size limit."""
    def _validator(file):
        if file.size > max_bytes:
            raise ValidationError(
                f"File size {file.size} exceeds limit of {max_bytes} bytes."
            )
    return _validator


def validate_file_extension(*allowed_extensions: str):
    """Return a validator that enforces a file extension whitelist."""
    allowed = {ext.lower().lstrip(".") for ext in allowed_extensions}

    def _validator(file):
        ext = os.path.splitext(file.name)[1].lower().lstrip(".")
        if ext not in allowed:
            raise ValidationError(f"Extension .{ext} is not allowed.")
    return _validator


def validate_image_dimensions(min_width=0, min_height=0, max_width=None, max_height=None):
    from PIL import Image

    def _validator(file):
        image = Image.open(file)
        width, height = image.size
        if width < min_width or height < min_height:
            raise ValidationError(f"Image must be at least {min_width}x{min_height}.")
        if max_width and width > max_width:
            raise ValidationError(f"Image width must not exceed {max_width}.")
        if max_height and height > max_height:
            raise ValidationError(f"Image height must not exceed {max_height}.")
    return _validator
```

---

## 14. Error Handling Architecture

### 14.1 Consistent Error Envelope

Every error response looks like this:

```json
{
  "error": {
    "code": "validation_error",
    "message": "One or more fields are invalid.",
    "details": {
      "email": ["This field is required."],
      "password": ["Password must be at least 10 characters."]
    },
    "request_id": "f3a9e2c1-4b2d-4b9a-a8c6-2e1d3f4a5b6c"
  }
}
```

### 14.2 Custom Exception Handler (`apps/core/exceptions.py`)

```python
import logging
import uuid

from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    PermissionDenied as DRFPermissionDenied,
    ValidationError as DRFValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class BusinessRuleError(APIException):
    """Raised when a business rule is violated."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Business rule violated."
    default_code = "business_rule_error"


def custom_exception_handler(exc, context):
    """
    Wrap every error in a consistent envelope:
    {
        "error": {
            "code": str,
            "message": str,
            "details": dict | null,
            "request_id": str,
        }
    }
    """
    request = context.get("request")
    request_id = getattr(request, "request_id", str(uuid.uuid4()))

    # Convert Django exceptions to DRF
    if isinstance(exc, DjangoValidationError):
        exc = DRFValidationError(detail=exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    if isinstance(exc, Http404):
        exc = APIException("Not found.")
        exc.status_code = status.HTTP_404_NOT_FOUND
    if isinstance(exc, PermissionDenied):
        exc = DRFPermissionDenied()

    response = drf_exception_handler(exc, context)

    if response is None:
        # Unhandled exception
        logger.exception("Unhandled exception", extra={"request_id": request_id})
        return Response(
            {
                "error": {
                    "code": "server_error",
                    "message": "An unexpected error occurred.",
                    "details": None,
                    "request_id": request_id,
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    if isinstance(data, dict) and "detail" in data and len(data) == 1:
        message = str(data["detail"])
        details = None
        code = getattr(exc, "default_code", "error")
    elif isinstance(data, dict):
        message = "One or more fields are invalid."
        details = data
        code = getattr(exc, "default_code", "validation_error")
    else:
        message = str(data)
        details = None
        code = "error"

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": request_id,
        }
    }
    return response
```

### 14.3 Error Handling in Views

```python
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError


@transaction.atomic
def create(self, request, *args, **kwargs):
    serializer = self.get_serializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        instance = MyService.run(**serializer.validated_data)
    except DjangoValidationError as exc:
        raise DRFValidationError(dict(exc))
    return Response(MyReadSerializer(instance).data, status=201)
```

**Rules:**
- Never catch `Exception` broadly without logging + re-raising.
- Never swallow errors silently.
- Always convert `DjangoValidationError` → `DRFValidationError` in views.
- Never leak stack traces in production responses.
- Use `BusinessRuleError` for domain-level violations.

### 14.4 Logging Errors

Log **at the appropriate level**:
- `logger.warning` — user error (bad input, missing resource).
- `logger.error` — service-level error (payment failed).
- `logger.exception` — unexpected exception (should be rare).

---

## 15. Database Design & Query Optimization

### 15.1 N+1 Query Prevention

**Bad:**
```python
orders = Order.objects.all()
for order in orders:
    print(order.user.email)  # N+1: one query per order
```

**Good:**
```python
orders = Order.objects.select_related("user").all()
for order in orders:
    print(order.user.email)  # 1 query
```

**Rule**: Any `get_queryset()` that accesses a FK/M2M in a serializer must `select_related` (FK) or `prefetch_related` (M2M, reverse FK).

### 15.2 `select_related` vs `prefetch_related`

| Use case | Method |
|----------|--------|
| ForeignKey / OneToOne (forward) | `select_related` |
| ManyToMany / reverse FK | `prefetch_related` |
| Reverse FK with filtered subset | `Prefetch(...)` |

```python
from django.db.models import Prefetch

orders = Order.objects.prefetch_related(
    Prefetch("items", queryset=OrderItem.objects.select_related("product"))
)
```

### 15.3 `only()` / `defer()` for Heavy Models

```python
# Only load the fields you need
users = User.objects.only("id", "email", "full_name")
```

**Warning**: `only()` is fragile — accessing a deferred field triggers a query. Use sparingly and always test.

### 15.4 Aggregation

```python
from django.db.models import Count, Sum, Avg

stats = Order.objects.aggregate(
    total_orders=Count("id"),
    total_revenue=Sum("total"),
    avg_order_value=Avg("total"),
)
```

### 15.5 Annotations

```python
from django.db.models import Count, F

products = Product.objects.annotate(
    order_count=Count("orderitem"),
    revenue=F("price") * F("order_count"),
).filter(order_count__gt=0)
```

### 15.6 Bulk Operations

```python
# Bulk create
OrderItem.objects.bulk_create([...])

# Bulk update
Order.objects.filter(id__in=ids).update(status="cancelled")
```

**Rules:**
- `bulk_create` / `bulk_update` do **not** call `save()` — no signals, no `clean()`. Validate before bulk ops.
- For large updates, use `.update()` (single SQL query) over looping `.save()`.

### 15.7 Database Transactions

```python
from django.db import transaction

@transaction.atomic
def transfer_funds(from_account, to_account, amount):
    from_account.balance -= amount
    from_account.save(update_fields=["balance"])
    to_account.balance += amount
    to_account.save(update_fields=["balance"])
```

**Rules:**
- Wrap multi-step writes in `@transaction.atomic`.
- `select_for_update()` for row-level locking in concurrent scenarios.
- Never do I/O (email, HTTP) inside `transaction.atomic` — the lock is held too long.
- Use `on_commit` for post-transaction side effects:

```python
transaction.on_commit(lambda: send_email.delay(order.id))
```

### 15.8 Migration Best Practices

- Always review generated migrations before committing.
- Never edit migrations that have been applied in production.
- Add **non-null** columns with a `default` (or in two steps: add nullable → backfill → set non-null).
- Add indexes in a separate migration (`AddIndex`) for large tables.
- Add `RunPython` migrations with a `reverse_code` function when possible.
- Use `atomic=False` for `AddIndex` on very large tables in PostgreSQL (CONCURRENTLY).

### 15.9 Database-level Constraints

```python
class Meta:
    constraints = [
        models.UniqueConstraint(fields=["user", "slug"], name="uniq_user_slug"),
        models.CheckConstraint(check=models.Q(price__gte=0), name="price_non_negative"),
    ]
```

**Rule**: Application-level validation can be bypassed (admin, scripts, other services). Add DB constraints for critical invariants.

---

## 16. File & Media Management

### 16.1 File Upload Validation

Every `FileField` / `ImageField` must enforce:

| Check | Validator |
|-------|-----------|
| File size | `validate_file_size(max_bytes)` |
| File extension | `validate_file_extension("jpg", "png", "pdf")` |
| Content type (server-side) | `python-magic` library |
| Image dimensions | `validate_image_dimensions(...)` |

```python
class Document(BaseModel):
    file = models.FileField(
        upload_to="documents/%Y/%m/",
        validators=[
            validate_file_size(10 * 1024 * 1024),  # 10 MB
            validate_file_extension("pdf", "docx"),
        ],
    )
```

### 16.2 Storage Backends

| Environment | Storage |
|-------------|---------|
| Local | `FileSystemStorage` (default) |
| Production | S3 / GCS / Azure Blob via `django-storages` |

**`config/settings/production.py`** (S3 example):

```python
if config("USE_S3", default=False, cast=bool):
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME")
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = "private"
```

### 16.3 Upload Paths

Always use **dated or user-scoped** paths:

```python
def user_directory_path(instance, filename):
    return f"users/{instance.user_id}/{filename}"

class Avatar(BaseModel):
    image = models.ImageField(upload_to=user_directory_path)
```

**Never** use the original filename as the only path — collision and path traversal risks.

### 16.4 Serving Files

- **Development**: `django.conf.urls.static.static()` in `config/urls.py`.
- **Production**: Nginx (`location /media/ { alias /app/mediafiles/; }`) or S3 signed URLs.
- **Never** serve user uploads through Django in production (slow, insecure, blocks workers).

---

## 17. Asynchronous Tasks with Celery

### 17.1 When to Use Celery

Use Celery for **any** operation that:
- Takes > 200 ms (emails, PDF generation, external API calls).
- Doesn't need to be synchronous for the response.
- Must be retried automatically.
- Runs on a schedule (cron-like).

**Never** do these in a request:
- Send emails
- Call slow external APIs (unless timeout is tight)
- Generate large files
- Process images at full resolution

### 17.2 Task Definition

**`apps/orders/tasks.py`**:

```python
import logging

from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

from .models import Order

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
    acks_late=True,
)
def send_order_confirmation_email(self, order_id: int):
    """Send the order confirmation email. Retries up to 5 times with backoff."""
    try:
        order = Order.objects.select_related("user").get(pk=order_id)
    except Order.DoesNotExist:
        logger.warning("Order %s not found; skipping email.", order_id)
        return

    send_mail(
        subject=f"Order #{order.id} confirmed",
        message=f"Thank you for your order, {order.user.short_name}.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[order.user.email],
        fail_silently=False,
    )
    logger.info("Order confirmation email sent for order %s", order_id)
```

### 17.3 Periodic Tasks

Use `django_celery_beat` (database-backed):

```python
CELERY_BEAT_SCHEDULE = {
    "cleanup-expired-sessions": {
        "task": "apps.accounts.tasks.cleanup_expired_sessions",
        "schedule": 60 * 60,  # hourly
    },
}
```

Or manage schedules via Django admin (recommended for visibility).

### 17.4 Task Rules

| Rule | Rationale |
|------|-----------|
| Tasks accept **IDs**, not model instances | Instance may be stale or unhashable |
| Tasks are **idempotent** | Retries are inevitable |
| Tasks log start, end, and failures | Observability |
| Tasks use `autoretry_for` with backoff | Resilience |
| Tasks are **small** — orchestrate, don't implement everything | Testable |
| Never `delay()` inside `transaction.atomic` without `on_commit` | Race condition |
| Never pass secrets or large payloads to Celery | Security + perf |

### 17.5 Testing Tasks

```python
@pytest.mark.django_db
def test_send_order_confirmation_email(mailoutbox, order):
    send_order_confirmation_email(order.id)
    assert len(mailoutbox) == 1
    assert order.user.email in mailoutbox[0].to
```

With `CELERY_TASK_ALWAYS_EAGER = True` in `test.py`, `.delay()` runs synchronously.

---

## 18. Caching Strategy

### 18.1 Cache Layers

| Layer | Purpose | Tool |
|-------|---------|------|
| View cache | Cache whole responses | `cache_page` |
| Fragment cache | Cache expensive blocks | `{% cache %}` (templates) |
| Query cache | Cache query results | `cache.get` / `cache.set` |
| Low-level | Cache computed values | `cache.get_or_set` |

### 18.2 Cache Keys Convention

```
<app>:<model>:<id>
<app>:<model>:<id>:<field>
<app>:<model>:list:<filter_hash>
```

**Always** set a TTL. Redis has no eviction by default in some configs.

### 18.3 Cache Invalidation

Prefer **explicit invalidation** in signals or services:

```python
from django.core.cache import cache

def invalidate_product_cache(product_id):
    cache.delete(f"products:product:{product_id}")


@receiver(post_save, sender=Product)
def _invalidate_product(sender, instance, **kwargs):
    invalidate_product_cache(instance.id)
```

**Rules:**
- Never cache user-specific data without user-scoped keys.
- Never cache without TTL.
- Invalidate on writes — no exceptions.

### 18.4 Common Patterns

```python
from django.core.cache import cache

# Get or compute
value = cache.get_or_set("key", compute_fn, timeout=300)

# Per-user
key = f"user:{request.user.id}:dashboard"
data = cache.get(key)
if data is None:
    data = build_dashboard(request.user)
    cache.set(key, data, 60 * 5)
```

---

## 19. API Documentation

### 19.1 drf-spectacular Setup

Installed and configured in settings (see §5.1). URLs:

- `/api/schema/` — raw OpenAPI 3.0 JSON
- `/api/docs/` — Swagger UI
- `/api/redoc/` — ReDoc

### 19.2 Annotate Custom Actions

```python
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter
from drf_spectacular.types import OpenApiTypes


class OrderViewSet(viewsets.ModelViewSet):
    @extend_schema(
        summary="Cancel an order",
        description="Cancels a pending order. Idempotent.",
        request=None,
        responses={
            200: OrderReadSerializer,
            400: OpenApiResponse(description="Order cannot be cancelled."),
        },
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        ...
```

### 19.3 Schema Rules

| Rule | Rationale |
|------|-----------|
| Annotate every custom action | Prevents "empty" docs |
| Document request + response bodies | Client teams rely on it |
| Document error responses | Error codes are part of the contract |
| Never include secrets in descriptions | Docs are public |
| Version the schema | `/api/v1/schema/` |

### 19.4 Documentation Checklist

- [ ] Public API has a short description (`SPECTACULAR_SETTINGS["DESCRIPTION"]`).
- [ ] Every endpoint has a summary.
- [ ] Every endpoint with >2 fields in request/response has explicit serializers.
- [ ] Auth requirements are documented (`securitySchemes`).

---

## 20. Testing Strategy

### 20.1 Test Pyramid

```
       ┌──────────┐
       │    E2E   │  (few — critical user flows)
       ├──────────┤
       │  API /   │  (moderate — every endpoint)
       │  View    │
       ├──────────┤
       │ Service  │  (many — business logic)
       ├──────────┤
       │ Model /  │  (many — validation, managers)
       │ Serial.  │
       └──────────┘
```

### 20.2 Test Structure

```
apps/<app>/tests/
├── __init__.py
├── conftest.py           # app-specific fixtures
├── test_models.py
├── test_serializers.py
├── test_services.py
├── test_views.py
└── test_tasks.py
```

### 20.3 pytest Configuration

**`pyproject.toml`**:

```toml
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings.test"
python_files = ["test_*.py", "*_test.py"]
testpaths = ["apps"]
addopts = [
    "--strict-markers",
    "--strict-config",
    "--cov=apps",
    "--cov-report=term-missing",
    "--cov-report=html:htmlcov",
    "--cov-fail-under=80",
]
markers = [
    "slow: slow tests",
    "integration: integration tests",
]
```

### 20.4 conftest.py (Root)

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="user@example.com", password="password123")


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(email="admin@example.com", password="password123")


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client
```

### 20.5 Test Types

**Model test:**

```python
import pytest
from django.core.exceptions import ValidationError

from apps.orders.models import Order


@pytest.mark.django_db
class TestOrderModel:
    def test_str(self, order):
        assert str(order) == f"Order #{order.id}"

    def test_negative_total_rejected(self, order):
        order.total = -1
        with pytest.raises(ValidationError):
            order.full_clean()
```

**Serializer test:**

```python
@pytest.mark.django_db
class TestOrderSerializer:
    def test_valid_data(self):
        from apps.orders.serializers import OrderCreateSerializer
        s = OrderCreateSerializer(data={"items": [{"product_id": 1, "quantity": 2}]})
        assert s.is_valid() is False  # product doesn't exist

    def test_empty_items_rejected(self):
        from apps.orders.serializers import OrderCreateSerializer
        s = OrderCreateSerializer(data={"items": []})
        assert not s.is_valid()
        assert "items" in s.errors
```

**View test:**

```python
@pytest.mark.django_db
class TestOrderViewSet:
    def test_list_unauthenticated_returns_401(self, api_client):
        r = api_client.get("/api/v1/orders/")
        assert r.status_code == 401

    def test_list_authenticated_returns_200(self, auth_client):
        r = auth_client.get("/api/v1/orders/")
        assert r.status_code == 200
        assert "results" in r.data

    def test_create_requires_auth(self, api_client):
        r = api_client.post("/api/v1/orders/", {})
        assert r.status_code == 401

    def test_create_invalid_returns_400(self, auth_client):
        r = auth_client.post("/api/v1/orders/", {"items": []})
        assert r.status_code == 400
```

**Service test:**

```python
@pytest.mark.django_db
def test_place_order_decrements_stock(product, user):
    from apps.orders.services import PlaceOrderService
    initial = product.stock
    PlaceOrderService.run(user=user, cart_items=[{"product": product, "quantity": 2}])
    product.refresh_from_db()
    assert product.stock == initial - 2
```

### 20.6 Factories (factory-boy)

**`apps/orders/factories.py`**:

```python
import factory
from factory.django import DjangoModelFactory

from .models import Order


class OrderFactory(DjangoModelFactory):
    class Meta:
        model = Order

    user = factory.SubFactory("apps.accounts.factories.UserFactory")
    status = "pending"
    total = 100
```

### 20.7 Testing Rules

| Rule | Rationale |
|------|-----------|
| Every endpoint has: happy path + auth failure + validation failure | Minimum coverage |
| Every service has unit tests | Business logic is the core |
| Never hit real external APIs | Use mocks (`unittest.mock`, `responses`) |
| Use `pytest.mark.django_db` on DB-touching tests | Isolation |
| Test **behaviour**, not implementation | Refactor-resilient |
| Never test private methods directly | Test through public API |
| Aim for 80%+ coverage — 100% is not the goal | Diminishing returns |
| Run tests in CI on every PR | Catch regressions |

---

## 21. Code Quality & Standards

### 21.1 Ruff Configuration

**`pyproject.toml`**:

```toml
[tool.ruff]
line-length = 100
target-version = "py312"
src = ["apps", "config"]

[tool.ruff.lint]
select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # pyflakes
    "I",   # isort
    "B",   # flake8-bugbear
    "C4",  # flake8-comprehensions
    "DJ",  # flake8-django
    "UP",  # pyupgrade
    "S",   # flake8-bandit (security)
    "SIM", # flake8-simplify
    "RUF", # ruff-specific
]
ignore = [
    "E501",  # line length (handled by formatter)
]

[tool.ruff.lint.per-file-ignores]
"**/migrations/*.py" = ["E501", "DJ001"]
"**/tests/*.py" = ["S101"]  # allow assert
"**/settings/*.py" = ["F405", "F403"]  # star imports in settings

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
```

### 21.2 mypy Configuration

```toml
[tool.mypy]
python_version = "3.12"
plugins = ["mypy_django_plugin.main", "mypy_drf_plugin.main"]
strict = true
warn_unused_configs = true
ignore_missing_imports = true
exclude = ["migrations/", "venv/"]

[tool.django-stubs]
django_settings_module = "config.settings.local"
```

### 21.3 Pre-commit Hooks

**`.pre-commit-config.yaml`**:

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: detect-private-key

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.5.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.10.0
    hooks:
      - id: mypy
        additional_dependencies:
          - django-stubs
          - djangorestframework-stubs
```

### 21.4 Type Hints

**Rule**: Every public function and method has type hints.

```python
from typing import Optional

def calculate_total(items: list[OrderItem], discount: Optional[Decimal] = None) -> Decimal:
    ...
```

- Use `Optional[X]` (or `X | None` with 3.10+).
- Never use bare `list`, `dict` — parameterize (`list[Order]`).
- Annotate return types, including `-> None`.
- Use `typing.Protocol` for duck-typed interfaces.

### 21.5 Naming Conventions

| Element | Convention |
|---------|-----------|
| Modules | `snake_case` |
| Packages | `snake_case` |
| Classes | `PascalCase` |
| Functions / methods | `snake_case` |
| Variables | `snake_case` |
| Constants | `UPPER_SNAKE_CASE` |
| URL names | `kebab-case` or `snake_case` (be consistent) |

### 21.6 Import Order

Handled by Ruff (`I` rule):
1. Standard library
2. Third-party
3. Local applications

Within each group, alphabetical.

---

## 22. Logging & Observability

### 22.1 Structured Logging

**Never** use `print()` in application code. Use `logger`.

```python
import logging

logger = logging.getLogger(__name__)

logger.info("Order placed", extra={"order_id": order.id, "user_id": user.id})
```

### 22.2 Request ID Middleware

**`apps/core/middleware.py`**:

```python
import uuid

from .logging import set_request_id


class RequestIDMiddleware:
    """Attaches a unique ID to every request for traceability."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.request_id = request_id
        set_request_id(request_id)
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response
```

### 22.3 Log Levels

| Level | When to use |
|-------|-------------|
| `DEBUG` | Verbose internals (disabled in prod) |
| `INFO` | Business events (order placed, user logged in) |
| `WARNING` | Recoverable issues (validation failed, retry) |
| `ERROR` | Failed operations (payment failed) |
| `CRITICAL` | System is unusable (DB unreachable) |

### 22.4 What to Log

**Do log:**
- Auth events (login, logout, failed login) — **never** the password.
- Business events (order placed, subscription cancelled).
- External API calls (endpoint, status, duration).
- Slow queries (> 500ms).
- Errors with stack traces.

**Don't log:**
- Passwords, tokens, secrets
- PII (unless required and documented)
- Full request bodies (may contain sensitive data)
- Health check successes (log at DEBUG)

### 22.5 Health & Readiness

- `/api/health/` — liveness: is the process running?
- `/api/health/ready/` — readiness: is the DB reachable? (add when using Kubernetes)

---

## 23. Security Best Practices

### 23.1 OWASP Top 10 Coverage

| Risk | Mitigation |
|------|-----------|
| **Broken Access Control** | Explicit `permission_classes`; object-level checks; `get_object()` always |
| **Cryptographic Failures** | HTTPS only; `SECURE_SSL_REDIRECT`; strong password hashers |
| **Injection** | ORM-only; no f-strings in `raw()`; parameterized queries |
| **Insecure Design** | Threat-model new features; security review in PR |
| **Security Misconfiguration** | `DEBUG=False`; safe defaults; env vars; no default creds |
| **Vulnerable Components** | `pip-audit` in CI; Dependabot; pin versions |
| **Identification/Auth Failures** | JWT rotation; rate limiting; account lockout |
| **Software/Data Integrity** | Signed webhooks; integrity checks on file uploads |
| **Logging/Monitoring Failures** | Structured logs; Sentry; alerts on error spikes |
| **SSRF** | Whitelist external hosts; never fetch user-supplied URLs |

### 23.2 Secrets Management

- Secrets live in `.env` (local) or secret managers (prod).
- Never commit `.env` — add to `.gitignore`.
- Rotate secrets on a schedule.
- Use different secrets per environment.
- Never log secrets.

### 23.3 Input Validation

- Validate **every** request body / query string / header you consume.
- Use serializers for all input.
- Never trust `Content-Length`, `X-Forwarded-For`, file names, or extensions.

### 23.4 File Upload Security

- Enforce extension whitelist + MIME type (via `python-magic`).
- Enforce size limit.
- Store outside web root (or in S3 with private ACL).
- Rename files (never serve under the user-provided name).
- Never execute uploaded files.
- Scan uploaded files (ClamAV / VirusTotal) for high-risk apps.

### 23.5 Rate Limiting

Configured in settings (see §5.1). Additional per-view throttles:

```python
from rest_framework.throttling import UserRateThrottle

class BurstThrottle(UserRateThrottle):
    scope = "burst"


class LoginView(APIView):
    throttle_classes = [BurstThrottle]
```

### 23.6 CORS

- **Never** `CORS_ALLOW_ALL_ORIGINS = True` in production.
- List allowed origins explicitly.
- If using cookies, set `CORS_ALLOW_CREDENTIALS = True` and **never** use `*` for origins.

### 23.7 HTTPS & Cookies

- `SECURE_SSL_REDIRECT = True` in production.
- `SESSION_COOKIE_SECURE = True`, `CSRF_COOKIE_SECURE = True`.
- `HTTPOnly` for session cookies.
- `SAMESITE_LAX` for cookies unless cross-site needed.

### 23.8 Dependency Security

- Run `pip-audit` in CI.
- Enable Dependabot / Renovate.
- Pin versions in `requirements/*.txt`.
- Never install from untrusted indexes.

---

## 24. Performance Optimization

### 24.1 Backend Performance Checklist

- [ ] Every list endpoint uses pagination.
- [ ] `get_queryset()` uses `select_related` / `prefetch_related`.
- [ ] No N+1 queries (verify with `django-debug-toolbar` in dev).
- [ ] Indexes on all filter/order fields.
- [ ] `only()` / `values()` on heavy reads (with caution).
- [ ] Slow operations offloaded to Celery.
- [ ] Response payloads are minimal (no overfetching).
- [ ] Database connection pooling (`CONN_MAX_AGE`).
- [ ] Cache expensive reads.
- [ ] Compression enabled (Gzip / Brotli).
- [ ] No synchronous external API calls in request path.

### 24.2 Query Profiling

**Dev**: `django-debug-toolbar` in `local.py`.
**Prod**: Log slow queries in Django settings:

```python
LOGGING["loggers"]["django.db.backends"] = {
    "handlers": ["console"],
    "level": "WARNING",
}
```

### 24.3 Payload Size

- Return only what the client needs.
- Never expose full nested trees by default.
- Split heavy endpoints into separate endpoints.
- Use `values()` + serializers for flat reads.

### 24.4 Gunicorn Workers

**Rule of thumb** for sync workers:

```
workers = (2 * CPU_CORES) + 1
```

Set `worker_class = "gthread"` or `"gevent"` for I/O-bound workloads.

---

## 25. Containerization & Docker

### 25.1 Dockerfile (Development)

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements/local.txt requirements/base.txt /app/requirements/
RUN pip install -r requirements/local.txt

COPY . /app/

EXPOSE 8000
```

### 25.2 Dockerfile.prod

```dockerfile
FROM python:3.12-slim AS builder

WORKDIR /app
COPY requirements/production.txt requirements/base.txt /app/requirements/
RUN pip install --user --no-cache-dir -r requirements/production.txt

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

WORKDIR /app
COPY . /app/

RUN python manage.py collectstatic --noinput

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
```

### 25.3 docker-compose.yml (Development)

```yaml
services:
  db:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data/
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: .
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - .:/app
      - static_volume:/app/staticfiles
      - media_volume:/app/mediafiles
    environment:
      - DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379/0
      - CELERY_BROKER_URL=redis://redis:6379/1
      - CELERY_RESULT_BACKEND=redis://redis:6379/2
    env_file: .env
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  celery_worker:
    build: .
    command: celery -A config worker -l info
    volumes:
      - .:/app
    env_file: .env
    environment:
      - DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}
      - CELERY_BROKER_URL=redis://redis:6379/1
    depends_on:
      - db
      - redis

  celery_beat:
    build: .
    command: celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
    volumes:
      - .:/app
    env_file: .env
    depends_on:
      - db
      - redis

volumes:
  postgres_data:
  static_volume:
  media_volume:
```

### 25.4 .dockerignore

```
.git
.github
.env
*.pyc
__pycache__
.pytest_cache
.mypy_cache
.ruff_cache
htmlcov
.venv
venv
node_modules
*.sqlite3
logs/
```

### 25.5 Container Rules

- **One process per container** — backend, worker, beat are separate services.
- **Never** `DEBUG=True` in production containers.
- **Never** run as `root` in production.
- **Always** use `.dockerignore` to keep images small.
- **Always** pin base images by tag (not `latest`).

---

## 26. Deployment & Production Readiness

### 26.1 Production Checklist

**Configuration:**
- [ ] `DEBUG=False`
- [ ] `SECRET_KEY` is random, ≥50 chars, from env
- [ ] `ALLOWED_HOSTS` explicitly set
- [ ] `DATABASE_URL` points to managed DB
- [ ] `CORS_ALLOWED_ORIGINS` explicit, not `*`
- [ ] `CSRF_TRUSTED_ORIGINS` explicit

**Security:**
- [ ] HTTPS enforced (`SECURE_SSL_REDIRECT=True`)
- [ ] Cookies `Secure` + `HttpOnly`
- [ ] HSTS enabled
- [ ] Sentry / error monitoring configured
- [ ] Admin URL changed (`/admin/` → `/secret-admin/`)
- [ ] Rate limiting enabled
- [ ] `pip-audit` clean

**Performance:**
- [ ] Gunicorn workers configured
- [ ] Database connection pooling
- [ ] Static files served by Nginx / CDN
- [ ] Media files on S3 / GCS
- [ ] Celery workers scaled
- [ ] Redis configured with maxmemory policy

**Operational:**
- [ ] Health check endpoint returns 200
- [ ] Logs aggregated (CloudWatch / Datadog / ELK)
- [ ] Database backups scheduled + tested restore
- [ ] Migration strategy documented
- [ ] Rollback plan exists
- [ ] Alerting on error rate, latency, disk, DB connections

### 26.2 Nginx Configuration

```nginx
server {
    listen 80;
    server_name api.example.com;

    client_max_body_size 20M;

    location /static/ {
        alias /app/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /media/ {
        alias /app/mediafiles/;
    }

    location / {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

### 26.3 Migration Strategy

**Never** run migrations as part of every container start in production. Instead:

1. Deploy new image (stopped containers are not serving).
2. Run `python manage.py migrate` as a separate one-off task.
3. Then start the new app containers.

For zero-downtime:

- Add new columns as `null=True`.
- Backfill data.
- Set `null=False` in a second migration.
- Deploy code that uses the new column only after the column exists.

### 26.4 Zero-Downtime Deploys

- Use rolling deploy (Kubernetes, ECS) or blue/green.
- Health check `/api/health/` before routing traffic.
- Graceful shutdown: Gunicorn `--graceful-timeout 30`.
- Celery workers: `TERM` signal triggers graceful shutdown.

### 26.5 Database Backups

- Automated daily snapshots (RDS, Cloud SQL).
- WAL archiving for point-in-time recovery.
- Test restore monthly.
- Store backups in a different region / account.

---

## 27. CI/CD Pipeline

### 27.1 GitHub Actions (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements/local.txt
      - run: ruff check .
      - run: ruff format --check .
      - run: mypy apps config

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    env:
      DJANGO_SETTINGS_MODULE: config.settings.test
      DJANGO_SECRET_KEY: test-secret-key
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/test_db
      REDIS_URL: redis://localhost:6379/0
      CELERY_BROKER_URL: redis://localhost:6379/1
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements/local.txt
      - run: python manage.py makemigrations --check --dry-run
      - run: python manage.py migrate
      - run: pytest
```

### 27.2 Deployment Workflow (`.github/workflows/deploy.yml`)

```yaml
name: Deploy

on:
  push:
    tags: ["v*"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: [test, lint]
    steps:
      - uses: actions/checkout@v4
      - name: Build & push image
        run: |
          docker build -f Dockerfile.prod -t registry.example.com/api:${{ github.ref_name }} .
          docker push registry.example.com/api:${{ github.ref_name }}
      - name: Deploy
        run: |
          ssh deploy@host "cd /app && \
            docker compose pull && \
            docker compose run --rm backend python manage.py migrate && \
            docker compose up -d --no-deps backend celery_worker celery_beat"
```

### 27.3 CI Rules

- **Lint must pass** before merge.
- **Tests must pass** before merge.
- **Migrations must be consistent** (`makemigrations --check`).
- **Coverage must not decrease** below threshold.
- **No direct push to `main`** — PR only.
- **Deploy from tags** or merges to `main` — never from local machines.

---

## 28. Development Workflow & Git Standards

### 28.1 Branch Naming

| Type | Pattern |
|------|---------|
| Feature | `feature/<short-description>` |
| Bug fix | `fix/<short-description>` |
| Hotfix | `hotfix/<short-description>` |
| Chore | `chore/<short-description>` |
| Release | `release/vX.Y.Z` |

### 28.2 Commit Messages (Conventional Commits)

```
<type>(<scope>): <subject>

<body (optional)>

<footer (optional)>
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation
- `style` — formatting only
- `refactor` — no behaviour change
- `perf` — performance
- `test` — tests
- `chore` — build / deps
- `ci` — CI config

**Examples:**
```
feat(orders): add cancel action

fix(auth): reject expired refresh tokens

refactor(core): extract BaseModel

feat(orders)!: remove legacy status field

BREAKING CHANGE: `Order.status` removed; use `Order.state`.
```

### 28.3 PR Checklist

- [ ] Description explains **what** and **why**
- [ ] Self-reviewed diff
- [ ] Tests added / updated
- [ ] Docs updated (if behaviour changed)
- [ ] Migrations reviewed
- [ ] No secrets committed
- [ ] CI passes
- [ ] ≤ 400 lines changed (split larger PRs)

### 28.4 Code Review Checklist (Reviewer)

- [ ] Does the change solve the stated problem?
- [ ] Are edge cases handled?
- [ ] Is there an N+1 query?
- [ ] Are permissions correct?
- [ ] Are inputs validated?
- [ ] Are errors handled consistently?
- [ ] Are tests meaningful (not just coverage padding)?
- [ ] Are migrations safe (no long locks, no data loss)?
- [ ] Are logs added for non-trivial operations?

### 28.5 Definition of Done

A feature is **done** when:

- [ ] All acceptance criteria met
- [ ] Tests written (happy + error paths)
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] API documented in OpenAPI schema
- [ ] Deployed to staging
- [ ] QA sign-off (if applicable)
- [ ] Migrations applied to production (if any)

---

## 29. Documentation Standards

### 29.1 README.md (root)

Must contain:
- Project description (1 paragraph).
- Stack overview.
- Setup instructions (bootstrap sequence).
- Running tests.
- Development commands.
- Deployment overview.

### 29.2 API Documentation

- **Auto-generated**: OpenAPI via drf-spectacular (`/api/docs/`).
- **Manual docs**: for conceptual guides (auth flow, webhook retries).

### 29.3 Code Documentation

- Every class has a docstring explaining *purpose*.
- Every public method has a docstring explaining *behaviour* (not implementation).
- Complex logic has inline comments explaining **why** (not **what**).
- Never leave `TODO` without a name and issue link: `# TODO(alice): handle currency conversion (#123)`.

### 29.4 ADRs (Architecture Decision Records)

For significant decisions, write an ADR in `docs/adr/`:

```markdown
# ADR-001: Use UUIDs for public-facing IDs

## Status
Accepted

## Context
Sequential IDs leak record counts and allow enumeration.

## Decision
Use UUIDv4 for user-facing models. Keep BigAutoField for internal models.

## Consequences
+ Safer against enumeration.
+ Merge-friendly across shards.
- Larger index size.
- Slightly slower joins.
```

---

## 30. Appendix: Quick Start Template & Checklists

### 30.1 New Project Bootstrap

```bash
# 1. Scaffold
mkdir myproject && cd myproject
mkdir apps requirements config

# 2. Python env (optional — Docker is preferred)
python -m venv .venv && source .venv/bin/activate

# 3. Install Django & create project
pip install django djangorestframework
django-admin startproject config .

# 4. Create apps
python manage.py startapp core apps/core
python manage.py startapp accounts apps/accounts

# 5. Copy in settings files from this guide
# 6. Copy in requirements/*.txt
# 7. Copy in .env.example, .gitignore, Dockerfile, docker-compose.yml
# 8. Create Custom User Model
# 9. Set AUTH_USER_MODEL = "accounts.User"
# 10. Initial migration
python manage.py makemigrations accounts
python manage.py migrate

# 11. Create superuser
python manage.py createsuperuser
```

### 30.2 New App Checklist

- [ ] `python manage.py startapp <name> apps/<name>`
- [ ] `apps/<name>/apps.py`: set `name = "apps.<name>"`, add `ready()`
- [ ] Register in `INSTALLED_APPS`
- [ ] Create `tests/` folder (not `tests.py`)
- [ ] Create `services.py`, `filters.py`, `tasks.py` as needed
- [ ] Create `urls.py` with `DefaultRouter`
- [ ] Add to `config/urls.py` under `/api/v1/`

### 30.3 New Feature Checklist

- [ ] Define models (with base classes, indexes, constraints).
- [ ] Write model tests.
- [ ] Create migration.
- [ ] Create read/write serializers.
- [ ] Write serializer tests.
- [ ] Create service for multi-step logic.
- [ ] Write service tests.
- [ ] Create viewset.
- [ ] Create filters.
- [ ] Write view tests (happy + auth + validation).
- [ ] Add tasks (if async).
- [ ] Test tasks.
- [ ] Add URL route.
- [ ] Annotate with `extend_schema`.
- [ ] Run `ruff`, `mypy`, `pytest` locally.
- [ ] Open PR.

### 30.4 Pre-Deployment Checklist

See §26.1.

### 30.5 The 10 Commandments of This Backend

1. **Thou shalt not hardcode secrets.**
2. **Thou shalt validate every input.**
3. **Thou shalt use `transaction.atomic` for writes.**
4. **Thou shalt `select_related` / `prefetch_related`.**
5. **Thou shalt test every endpoint.**
6. **Thou shalt never block the request with slow I/O.**
7. **Thou shalt return a consistent error envelope.**
8. **Thou shalt index what thou filterest.**
9. **Thou shalt paginate lists.**
10. **Thou shalt document custom actions.**

### 30.6 Requirements Templates

**`requirements/base.txt`**:

```txt
Django>=5.0,<6.0
djangorestframework>=3.15,<4.0
djangorestframework-simplejwt>=5.3,<6.0
django-cors-headers>=4.3,<5.0
django-filter>=24.0,<25.0
drf-spectacular>=0.27,<1.0
psycopg[binary]>=3.1,<4.0
dj-database-url>=2.1,<3.0
python-decouple>=3.8,<4.0
Pillow>=10.0,<11.0
celery>=5.3,<6.0
redis>=5.0,<6.0
django-celery-beat>=2.6,<3.0
django-celery-results>=2.5,<3.0
python-json-logger>=2.0,<3.0
```

**`requirements/local.txt`**:

```txt
-r base.txt
django-debug-toolbar>=4.4,<5.0
django-extensions>=3.2,<4.0
pytest>=8.0,<9.0
pytest-django>=4.8,<5.0
pytest-cov>=5.0,<6.0
factory-boy>=3.3,<4.0
ruff>=0.5,<1.0
mypy>=1.10,<2.0
django-stubs>=5.0,<6.0
djangorestframework-stubs>=3.15,<4.0
pre-commit>=3.7,<4.0
```

**`requirements/production.txt`**:

```txt
-r base.txt
gunicorn>=22.0,<23.0
sentry-sdk[django]>=2.0,<3.0
django-storages[boto3]>=1.14,<2.0
```

---

**End of Guide.**

> This document is the canonical backend standard. Every project, every contributor, and every AI agent should follow it verbatim unless there is a documented, reviewed, and approved exception (recorded as an ADR in `docs/adr/`). Consistency is a feature.