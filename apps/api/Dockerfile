# syntax=docker/dockerfile:1
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 gizer
WORKDIR /app
COPY requirements.lock pyproject.toml ./
# Optional build secret `extra_ca` lets the build run behind a TLS-inspecting proxy; unused otherwise.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export PIP_CERT=/run/secrets/extra_ca; fi; pip install -r requirements.lock
COPY gizer ./gizer
COPY migrations ./migrations
COPY alembic.ini ./
RUN pip install --no-deps --no-build-isolation -e .
USER gizer
EXPOSE 8000
CMD ["uvicorn", "gizer.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
