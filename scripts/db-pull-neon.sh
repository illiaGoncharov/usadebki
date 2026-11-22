#!/usr/bin/env bash
# Стянуть базу с Neon (прод/бета) на локальный Postgres.
# Не путать с beta:publish / db:push-neon — те льют локалку → Neon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

URL="${NEON_DATABASE_URL:-}"
if [[ -z "$URL" ]]; then
  echo "В .env задайте NEON_DATABASE_URL."
  exit 1
fi

# Для pg_dump надёжнее прямой хост, не pooler
DUMP_URL="${URL/-pooler./.}"

mkdir -p data
DUMP_NAME="neon-pull.dump"

echo "1/3 Дамп с Neon → data/${DUMP_NAME}…"
docker run --rm \
  -v "$ROOT/data:/data" \
  postgres:16-alpine \
  pg_dump -d "$DUMP_URL" --no-owner --no-acl -Fc -f "/data/${DUMP_NAME}"

ls -lh "$ROOT/data/${DUMP_NAME}"

echo "2/3 Копирую дамп в контейнер и чищу локальные схемы…"
docker compose cp "data/${DUMP_NAME}" "db:/tmp/${DUMP_NAME}"
docker compose exec -T db \
  psql -U usadebki -d usadebki -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO usadebki;
GRANT ALL ON SCHEMA public TO public;
DROP SCHEMA IF EXISTS drizzle CASCADE;
SQL

echo "3/3 Восстановление в локальный Postgres…"
# Код выхода 1 у pg_restore бывает из‑за harmless warnings (ACL/extension)
set +e
docker compose exec -T db \
  pg_restore -U usadebki -d usadebki --no-owner --no-acl "/tmp/${DUMP_NAME}"
RESTORE_STATUS=$?
set -e
if [[ "$RESTORE_STATUS" -gt 1 ]]; then
  echo "pg_restore завершился с кодом ${RESTORE_STATUS}"
  exit "$RESTORE_STATUS"
fi

COUNT="$(docker compose exec -T db psql -U usadebki -d usadebki -tAc 'select count(*) from estates' | tr -d '[:space:]')"
echo "Готово: локально estates = ${COUNT}"
