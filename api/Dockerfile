# EasyHR API (FastAPI). Used by Railway (root directory: api) and any Docker host.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

RUN useradd --create-home --uid 10001 easyhr
USER easyhr

EXPOSE 8000

# 1. bootstrap: migrations + roles + first master admin (idempotent, safe on every deploy).
# 2. uvicorn on "::" so it is reachable over Railway's private network (IPv6, and IPv4 on Linux
#    dual-stack). PORT and WEB_CONCURRENCY can be overridden by the host.
CMD ["sh", "-c", "python -m app.bootstrap && exec uvicorn app.main:app --host :: --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2}"]
