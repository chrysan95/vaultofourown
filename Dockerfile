# syntax=docker/dockerfile:1

# ---------- Stage 1: builder (install Python dependencies into a virtualenv) ----------
FROM python:3.12.7-slim-bookworm AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /build
# dependency file first -> this layer is cached until requirements.txt changes
COPY app/requirements.txt .
RUN pip install -r requirements.txt

# ---------- Stage 2: runtime (only the venv + source code) ----------
FROM python:3.12.7-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PORT=5000

RUN useradd --create-home --uid 10001 vault
WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=vault:vault app/ .

USER vault
EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/health').status==200 else 1)"]

ENTRYPOINT ["gunicorn"]
CMD ["--bind", "0.0.0.0:5000", "--workers", "2", "--access-logfile", "-", "app:app"]
