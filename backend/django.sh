#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# myHealthLog backend entrypoint.
#
# Waits for PostgreSQL, runs migrations, then starts the Django dev server.
# In production use Gunicorn directly (see Dockerfile.prod CMD).
# ---------------------------------------------------------------------------
set -euo pipefail

echo "⏳ Waiting for PostgreSQL..."
until python -c "
import os, psycopg, sys
try:
    psycopg.connect(os.environ['DATABASE_URL'])
    print('✅ PostgreSQL is ready.')
except Exception as e:
    print(f'Not ready: {e}')
    sys.exit(1)
"; do
    sleep 2
done

echo "🔄 Running database migrations..."
python manage.py migrate --noinput

echo "📂 Collecting static files..."
python manage.py collectstatic --noinput

echo "🚀 Starting Django development server..."
exec python manage.py runserver 0.0.0.0:8000
