#!/bin/bash
# Wipes the demo database and seeds it fresh. Cron runs this nightly, so
# whatever a reviewer changed is gone by morning and "Today" is today again.
set -euo pipefail
cd "$(dirname "$0")"

docker compose pull -q
docker compose stop yarukoto
rm -f data/yarukoto.db data/yarukoto.db-wal data/yarukoto.db-shm
docker compose up -d

for _ in $(seq 1 60); do
  if docker compose exec -T yarukoto wget -qO- http://localhost:8080/api/v1/health >/dev/null 2>&1; then
    exec docker compose exec -T yarukoto node /seed/seed.mjs
  fi
  sleep 2
done
echo "The server never answered /health; not seeded." >&2
exit 1
