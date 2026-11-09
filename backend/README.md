# myHealthLog Backend

AI-powered personal health record system — Django REST Framework API.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Setup & Installation](#4-setup--installation)
5. [Environment Variables](#5-environment-variables)
6. [API Reference](#6-api-reference)
7. [AI Features](#7-ai-features)
8. [FHIR Data Mobility](#8-fhir-data-mobility)
9. [Security](#9-security)
10. [Testing](#10-testing)
11. [Deployment](#11-deployment)
12. [Key Algorithms & Design Decisions](#12-key-algorithms--design-decisions)

---

## 1. Architecture Overview

```
HTTP Request
    │
    ▼
┌──────────┐    ┌──────────┐    ┌──────────────────┐
│  Nginx   │───▶│  Django  │───▶│  PostgreSQL 17   │
│ :8080    │    │  :8000   │    │                  │
└──────────┘    └──────────┘    └──────────────────┘
                    │
                    ▼
             ┌──────────────────┐     ┌──────────────┐
             │  Celery Worker   │────▶│  Redis 7     │
             │  (AI extraction) │     │  (broker +   │
             └──────────────────┘     │   cache)     │
                                      └──────────────┘
                                            │
                                      ┌──────────────┐
                                      │ Google Gemini│
                                      │  (AI layer)  │
                                      └──────────────┘
```

### Layered architecture (per request)

```
View → Serializer → Service → Model → Database
```

- **Views** — HTTP concerns only: parse request, return response.
- **Serializers** — input validation and output representation.
- **Services** — business logic, multi-model orchestration, Gemini calls.
- **Models** — data invariants, DB constraints.
- **Tasks** — async work via Celery (AI document extraction, emails).

---

## 2. Technology Stack

| Layer | Tool | Version |
|---|---|---|
| Language | Python | 3.12 |
| Framework | Django | 5.x |
| API | Django REST Framework | 3.15 |
| Auth | djangorestframework-simplejwt | 5.3 |
| Database | PostgreSQL | 17 |
| DB Driver | psycopg[binary] | 3.1 |
| Cache / Broker | Redis | 7 |
| Task Queue | Celery | 5.3 |
| AI | Google Gemini (google-generativeai) | 0.7 |
| Schema | drf-spectacular (OpenAPI 3.0) | 0.27 |
| Containerisation | Docker + Docker Compose | 24 / 2.20 |

---

## 3. Project Structure

```
backend/
├── apps/
│   ├── core/           # BaseModel, exceptions, pagination, permissions, middleware
│   ├── accounts/       # User model, JWT auth, Google OAuth, onboarding
│   ├── profiles/       # HealthProfile, EmergencyContact
│   ├── records/        # 8 health record types + AI document extraction
│   ├── contexts/       # HealthContext (condition / pregnancy lenses)
│   ├── sharing/        # CareProvider (share codes), EmergencySettings, CareProxyGrant
│   ├── emergency/      # Public token endpoint + AI dynamic summary
│   ├── copilot/        # AI Health Copilot chat
│   └── fhir/           # FHIR R4 export + clinical HTML summary
├── config/
│   ├── settings/
│   │   ├── base.py     # Shared settings
│   │   ├── local.py    # Development overrides
│   │   ├── production.py
│   │   └── test.py
│   ├── celery.py
│   └── urls.py
├── requirements/
│   ├── base.txt
│   ├── local.txt
│   ├── production.txt
│   └── test.txt
├── Dockerfile
├── Dockerfile.prod
├── django.sh           # Dev entrypoint (waits for DB, migrates, runs server)
├── manage.py
├── conftest.py
├── pyproject.toml      # pytest + ruff + mypy config
└── .env.example
```

---

## 4. Setup & Installation

### Prerequisites

- Docker Desktop 24+
- Docker Compose 2.20+

### Quick start (Docker — recommended)

```bash
# 1. Clone the project
git clone <repo-url> && cd myHealthLog

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set GEMINI_API_KEY and GOOGLE_OAUTH2_CLIENT_ID

# 3. Build and start all services
docker compose up --build

# 4. Verify
curl http://localhost/api/health/
# → {"status": "ok", "database": "ok"}

# 5. Browse the API docs
open http://localhost/api/docs/
```

### Create a superuser (first run)

```bash
docker compose exec backend python manage.py createsuperuser
```

### Local development without Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements/local.txt
# Set DATABASE_URL and REDIS_URL to local instances
python manage.py migrate
python manage.py runserver
```

---

## 5. Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your values.

| Variable | Required | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | ✅ | Django secret key — 50+ random chars |
| `DATABASE_URL` | ✅ | PostgreSQL connection URL |
| `REDIS_URL` | ✅ | Redis URL for cache |
| `CELERY_BROKER_URL` | ✅ | Redis URL for Celery broker |
| `GEMINI_API_KEY` | For AI features | Google Gemini API key |
| `GOOGLE_OAUTH2_CLIENT_ID` | For Google login | OAuth2 client ID |
| `GOOGLE_OAUTH2_CLIENT_SECRET` | For Google login | OAuth2 client secret |
| `DJANGO_DEBUG` | ❌ | `True` in dev, **`False` in production** |
| `ALLOWED_HOSTS` | ✅ in prod | Comma-separated allowed hosts |
| `CORS_ALLOWED_ORIGINS` | ✅ in prod | Comma-separated allowed origins |

---

## 6. API Reference

Interactive docs: **http://localhost/api/docs/** (Swagger UI)

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register/` | Create account, returns JWT pair |
| POST | `/api/v1/auth/login/` | Email+password login, returns JWT pair + user |
| POST | `/api/v1/auth/refresh/` | Exchange refresh token for new access token |
| POST | `/api/v1/auth/logout/` | Blacklist refresh token |
| GET | `/api/v1/auth/me/` | Current user profile |
| PATCH | `/api/v1/auth/me/` | Update display name |
| POST | `/api/v1/auth/password/change/` | Change password |
| POST | `/api/v1/auth/google/` | Google OAuth2 token exchange |
| POST | `/api/v1/auth/onboarding/complete/` | Mark onboarding complete |

All other endpoints require `Authorization: Bearer <access_token>`.

### Health Records (all support list/create/retrieve/update/partial_update/destroy)

| Endpoint | Record Type |
|---|---|
| `/api/v1/records/allergies/` | Allergies |
| `/api/v1/records/medications/` | Medications |
| `/api/v1/records/conditions/` | Medical conditions |
| `/api/v1/records/appointments/` | Appointments |
| `/api/v1/records/documents/` | Health documents (file upload) |
| `/api/v1/records/procedures/` | Procedures |
| `/api/v1/records/immunizations/` | Immunisations |
| `/api/v1/records/vitals/` | Vital readings |
| `/api/v1/records/vitals/latest/` | Latest reading per vital type |
| `/api/v1/records/documents/<id>/retry-extraction/` | Retry AI extraction |

### Profile

| Method | Endpoint | Description |
|---|---|---|
| GET/PATCH | `/api/v1/profile/` | Read / update health profile |
| PATCH | `/api/v1/profile/photo/` | Upload profile photo |
| GET/POST | `/api/v1/profile/contacts/` | List / add emergency contacts |
| PUT/PATCH/DELETE | `/api/v1/profile/contacts/<id>/` | Manage one contact |

### Sharing & Safety

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/v1/sharing/providers/` | List / create provider shares |
| GET/PATCH/DELETE | `/api/v1/sharing/providers/<id>/` | Manage one share |
| POST | `/api/v1/sharing/providers/<id>/revoke/` | Revoke a share |
| GET/PATCH | `/api/v1/sharing/emergency/` | Read / update emergency card settings |
| POST | `/api/v1/sharing/emergency/regenerate/` | Regenerate emergency token |
| GET/POST | `/api/v1/sharing/proxies/` | List / invite care proxy |
| POST | `/api/v1/sharing/proxies/<id>/revoke/` | Revoke proxy grant |
| POST | `/api/v1/sharing/proxies/<id>/accept/` | Accept invitation |
| POST | `/api/v1/sharing/proxies/<id>/decline/` | Decline invitation |
| POST | `/api/v1/sharing/proxies/<id>/resend/` | Resend invitation |
| PATCH | `/api/v1/sharing/proxies/<id>/` | Update permission level |
| POST | `/api/v1/sharing/provider-access/` | (public) Provider opens a share |
| POST | `/api/v1/sharing/provider-access/note/` | (public) Provider adds a note to the record |

### Emergency (public endpoints — no auth)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/emergency/card/<token>/` | Resolve emergency token → card |
| POST | `/api/v1/emergency/card/<token>/verify-pin/` | Verify PIN, return card |

### Emergency (authenticated)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/emergency/dynamic-ai-summary/` | AI-prioritised emergency summary |
| POST | `/api/v1/emergency/dynamic-ai-summary/invalidate/` | Invalidate AI cache |

### Health Copilot

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/copilot/chat/` | Submit a health question |
| GET | `/api/v1/copilot/context/` | Personal health context preview |

### Data Export

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/export/fhir/` | Download FHIR R4 Bundle (.json) |
| GET | `/api/v1/export/summary/` | Download clinical HTML summary |

### Health Contexts

| Endpoint | Description |
|---|---|
| `/api/v1/contexts/` | CRUD for condition / life-stage lenses |

### System

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health/` | Liveness probe |
| GET | `/api/docs/` | Swagger UI |
| GET | `/api/redoc/` | ReDoc |
| GET | `/api/schema/` | Raw OpenAPI JSON |

---

## 7. AI Features

### Document Extraction

When a `HealthDocument` is uploaded, a Celery task (`extract_document_with_ai`) is queued
automatically. It:

1. Reads the file bytes and sends them inline to Gemini.
2. Prompts Gemini to extract structured data (type, date, findings, medications, conditions).
3. Parses the JSON response and stores it in `HealthDocument.ai_extraction`.
4. Updates `ai_extraction_status`: `PENDING → PROCESSING → DONE | FAILED`.

The frontend polls `ai_extraction_status` to show a processing indicator.

### AI Dynamic Emergency Summary

`GET /api/v1/emergency/dynamic-ai-summary/`

1. Compiles the user's full health record into a structured JSON snapshot.
2. Sends it to Gemini with a prompt instructing it to act as a clinical AI.
3. Gemini returns a JSON object matching the strict `AIDynamicSummary` schema.
4. The result is cached in Redis (TTL: `EMERGENCY_AI_SUMMARY_CACHE_TTL`, default 1h).
5. Subsequent requests return the cached result — no Gemini call.
6. Cache is invalidated via `POST /api/v1/emergency/dynamic-ai-summary/invalidate/`.

**Triage levels**: `stable` | `warning` | `critical` — determined by Gemini based on allergy severity, vital abnormalities, and condition activity.

### Health Copilot Chat

`POST /api/v1/copilot/chat/`

1. Builds a "personal context" block from the user's record (blood type, allergies, active medications, active conditions, recent vitals).
2. Injects this context into the Gemini system prompt alongside hard-coded conflict-detection and disclaimer rules.
3. Routes the question + conversation history through a Gemini chat session.
4. Returns the plain-text response.

**Conflict detection**: the system prompt explicitly instructs Gemini to check proposed medications or behaviours against the patient's actual data and flag conflicts.

**Guardrail**: questions requiring acute diagnosis, prescribing, or outside health scope trigger the disclaimer: *"⚕️ This is not medical advice. Please consult a qualified healthcare professional."*

---

## 8. FHIR Data Mobility

`GET /api/v1/export/fhir/` produces an HL7 FHIR R4 Collection Bundle containing:

| myHealthLog Type | FHIR Resource |
|---|---|
| HealthProfile | Patient |
| Blood type | Observation (LOINC 883-9) |
| Genotype | Observation (text) |
| Allergy | AllergyIntolerance |
| Medication | MedicationStatement |
| Condition | Condition (ICD-10 when available) |
| Appointment | Appointment |
| Immunization | Immunization |
| Procedure | Procedure |
| VitalReading | Observation (LOINC where known) |

---

## 9. Security

- All secrets in environment variables — never hardcoded.
- JWT authentication on every non-public endpoint.
- Token blacklist on logout (`rest_framework_simplejwt.token_blacklist`).
- Share codes and emergency tokens stored as SHA-256 hashes — raw code returned once, never stored.
- File uploads validated for size (15 MB max), extension whitelist, and MIME type.
- User-scoped queries — every viewset filters `get_queryset()` by `user=request.user`.
- Emergency card PIN verified by hash comparison — brute-force rate-limited (10 req/min).
- CORS and CSRF configured from environment variables.
- Production: `SECURE_SSL_REDIRECT`, `HSTS`, `HttpOnly` / `Secure` cookies.
- `DEBUG = False` in production; stack traces never exposed in responses.
- Consistent error envelope — never leaks internal structure.

---

## 10. Testing

```bash
# Run inside the backend container (or local venv)
docker compose exec backend pytest

# With coverage report
docker compose exec backend pytest --cov=apps --cov-report=term-missing

# Run a specific test module
docker compose exec backend pytest apps/accounts/tests/test_auth.py -v
```

Test settings: `config/settings/test.py`
- In-memory cache (no Redis needed)
- Synchronous Celery (`CELERY_TASK_ALWAYS_EAGER=True`)
- MD5 password hasher (faster)
- In-memory file storage

---

## 11. Deployment

### Production Dockerfile

```bash
docker build -f Dockerfile.prod -t myhealthlog-api:latest .
```

### Production checklist

- [ ] `DJANGO_SECRET_KEY` is 50+ random chars, set in secrets manager
- [ ] `DJANGO_DEBUG=False`
- [ ] `ALLOWED_HOSTS` explicitly set
- [ ] `CORS_ALLOWED_ORIGINS` explicitly set (no wildcard)
- [ ] `SECURE_SSL_REDIRECT=True` (via `config/settings/production.py`)
- [ ] Database is a managed PostgreSQL instance (RDS / Cloud SQL)
- [ ] Redis is a managed instance (ElastiCache / Upstash)
- [ ] `GEMINI_API_KEY` set
- [ ] Media files on S3 (`USE_S3=True`)
- [ ] Migrations run: `python manage.py migrate`
- [ ] Static files collected: `python manage.py collectstatic`
- [ ] `SENTRY_DSN` set for error monitoring

---

## 12. Key Algorithms & Design Decisions

### UUID Primary Keys
All public-facing models use UUIDs instead of sequential integers to prevent
ID enumeration — a meaningful privacy protection for health records.

### Soft Delete
`BaseModel` extends `SoftDeleteModel`. Deleting a record sets `deleted_at` rather
than issuing `DELETE SQL`. The default manager filters out soft-deleted rows
automatically. Hard deletion is available via `.hard_delete()` for GDPR requests.

### Share Code & Emergency Token Security
Raw codes and tokens are **never stored**. Only their `SHA-256(code)` is persisted.
When a user creates a share link or regenerates an emergency token, the raw code
is returned once in the HTTP response and discarded server-side. A database breach
exposes only hashes, which are computationally infeasible to reverse into valid codes.

### AI Emergency Summary Caching
Gemini is expensive and slow. The AI dynamic summary is cached in Redis with a
configurable TTL (default 1 hour). The cache key is `emergency_ai_summary_v1:<user_id>`.
Cache invalidation is explicit — the frontend calls the invalidate endpoint after
the user makes significant record changes.

### AI Document Extraction Pipeline
1. On `HealthDocument` creation → `transaction.on_commit()` queues the Celery task.
   Using `on_commit` ensures the task is not queued if the transaction rolls back.
2. The task reads file bytes and sends them as an inline MIME part to Gemini.
3. Gemini response is constrained to `application/json` mime type to reduce hallucination.
4. If the response is invalid JSON, the status is set to `FAILED` and Celery retries
   up to 3 times with exponential backoff.

### Health Copilot Grounding
The personal health context is rebuilt on every request (not cached) so it always
reflects the user's latest record. This is fast because it is a set of simple DB
reads, not AI inference. The Gemini call itself is what takes time.

### FHIR Mapping Strategy
The FHIR builder does not claim conformance (no profile URL beyond the base
StructureDefinition). It uses the correct resource types and LOINC/ICD-10 codes
where available, falling back to `text` codings gracefully. This makes the export
useful in practice (importable by EHR systems that accept text-coded resources)
without requiring full terminology binding.
