FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Only the runtime dependencies, never requirements-dev.txt (pytest,
# pip-audit): those are test-only and add nothing at runtime.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

RUN useradd --create-home --shell /usr/sbin/nologin appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

# --proxy-headers --forwarded-allow-ips=*: only Caddy can reach this port (it
# is not published in docker-compose.yml, only exposed on the compose
# network), so trusting forwarded headers from any source on that network is
# safe and lets the rate limiter see the real client IP instead of Caddy's.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
