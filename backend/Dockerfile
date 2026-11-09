FROM python:3.13.0rc1-alpine3.20

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System dependencies needed by psycopg3, Pillow, and python-magic for Alpine
RUN apk update && apk add --no-cache \
        build-base \
        postgresql-dev \
        curl \
        file \
        file-dev \
    && rm -rf /var/cache/apk/*

# Install Python dependencies first so Docker can cache this layer
COPY requirements/local.txt requirements/base.txt /app/requirements/
RUN pip install -r requirements/local.txt

# Copy the rest of the project
COPY . /app/

# Ensure the logs directory exists
RUN mkdir -p /app/logs /app/mediafiles /app/staticfiles

EXPOSE 8000
