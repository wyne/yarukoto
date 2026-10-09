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
    # The reviewer is a household member with a fixed token, so App Review can
    # exercise "Delete my account" for real. Pairing would mint a new token
    # every night, so the rows go in directly; tokens are stored as SHA-256.
    reviewer=$(grep '^YARUKOTO_REVIEWER_TOKEN=' .env | cut -d= -f2-)
    if [ -n "$reviewer" ]; then
      hash=$(printf %s "$reviewer" | sha256sum | cut -d' ' -f1)
      docker compose exec -T yarukoto sqlite3 /data/yarukoto.db <<SQL
INSERT INTO users (id, name, role, created_at) VALUES ('u-reviewer', 'App Reviewer', 'member', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO devices (id, user_id, name, kind, token_hash, created_at) VALUES ('d-reviewer', 'u-reviewer', 'App Review', 'app', '$hash', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
SQL
    fi
    exec docker compose exec -T yarukoto node /seed/seed.mjs
  fi
  sleep 2
done
echo "The server never answered /health; not seeded." >&2
exit 1
