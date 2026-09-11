# backend/

The Django backend for myHealthLog. Intentionally **empty for now** — the
scaffold phase only sets up the infra (nginx + frontend + docker-compose).

When development starts, this directory will get the standard Django + DRF
layout (manage.py, the project package, apps, requirements). Uncomment the
commented `postgresdb` / `redis` / `backend` services in
[../docker-compose.yml](../docker-compose.yml) and the `api` upstream +
location block in [../nginx/nginx.conf](../nginx/nginx.conf) to wire it in.
