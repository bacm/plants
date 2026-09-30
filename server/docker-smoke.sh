#!/usr/bin/env bash
# Builds the server image, starts it and waits for /health. A plain
# `docker build` passed while the image could not start: a module missing
# from the Dockerfile's COPY list only fails at import time.
set -euo pipefail

IMAGE=plants-api-smoke
NAME=plants-api-smoke

cd "$(dirname "$0")"
docker build -t "$IMAGE" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p 127.0.0.1:8000:8000 \
  -e OPENAI_API_KEY=smoke-test-not-a-key \
  -e API_TOKENS="$(printf 'a%.0s' $(seq 1 64))" \
  "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
    echo "docker-smoke: /health answered"
    exit 0
  fi
  sleep 1
done

docker logs "$NAME" >&2 || true
echo "docker-smoke: the image did not answer /health" >&2
exit 1
