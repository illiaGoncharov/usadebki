#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/data"
docker compose -f "$ROOT/docker-compose.yml" exec -T db \
  pg_dump -U usadebki --no-owner --no-acl -Fc usadebki >"$ROOT/data/usadebki.dump"
ls -lh "$ROOT/data/usadebki.dump"