# myHealthLog

Personal Health Record with condition-aware profiles. Responsive web app.

## Topology

```
browser ──▶ nginx :80  ──┬─▶ frontend (Vite dev server) :5173      "/"
                         └─▶ backend  (Django/DRF)       :8000      "/api", "/admin", "/ws"   ← added later
```

- **`frontend/`** — React + TypeScript + Tailwind v4 (Vite). This is the focus right now.
- **`nginx/`** — reverse proxy. Single entry point on port 80; also carries the Vite HMR websocket.
- **`backend/`** — empty placeholder. Django/DRF goes here later; the compose + nginx config have commented, ready-to-enable stubs.

## Prerequisites

- Docker + Docker Compose v2 (`docker compose version` ≥ 2.22 for `watch`).
- For running the frontend outside Docker: Node ≥ 20.

## Run (Docker — recommended)

`docker compose watch` starts the services **and** streams file changes into the containers,
so frontend edits hot-reload and `nginx.conf` edits restart nginx.

```bash
docker compose watch
```

Then open:

- **http://localhost:5173** — frontend directly. Use this while developing: HMR is instant and has no proxy in the way.
- **http://localhost** — through nginx. This is the integrated entry that will also route `/api` to the backend once it exists.

Stop with `Ctrl-C`, or `docker compose down` to remove containers.

> First run builds the image and installs dependencies inside the container — give it a minute.

## Run (frontend only, no Docker)

```bash
cd frontend
cp .env.example .env      # first time only
npm install
npm run dev
```

## Notes

- **`.env` is optional.** A fresh clone runs without one (compose declares it `required: false`, and the app defaults to `VITE_API_URL=/api`). Copy `frontend/.env.example` to `frontend/.env` only when you want to override the API base for a non-nginx run. `.env` is git-ignored.
- **Design tokens are placeholders.** `frontend/src/index.css` carries a neutral `@theme` until a design direction is chosen from `docs/design-samples/`; real OKLCH tokens replace it then.
- **Enabling the backend later:** uncomment the backend stack in `docker-compose.yml`, uncomment the `api` upstream + `/(admin|api|ws)` and static/media blocks in `nginx/nginx.conf`, drop the Django project into `backend/`, and re-run `docker compose watch`.
