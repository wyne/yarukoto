#!/bin/bash
# Wipes the demo database and seeds it fresh. Cron runs this nightly, so
# whatever a reviewer changed is gone by morning and "Today" is today again.
set -euo pipefail
cd "$(dirname "$0")"

# Fetch the rest of the kit from main first, so a change merged there reaches the
# VM by the next morning instead of waiting for a reboot. startup.sh is the one
# file this can't refresh: the VM runs the copy stored in its metadata.
RAW=https://raw.githubusercontent.com/wyne/yarukoto/main/deploy/demo
new=$(mktemp -d)
trap 'rm -rf "$new"' EXIT
if (cd "$new" && for f in compose.yml Caddyfile seed.mjs reset.sh; do curl -fsSL "$RAW/$f" -o "$f" || exit 1; done); then
  # seed.mjs and Caddyfile are bind-mounted as single files, which pins the inode:
  # overwrite them in place, or the containers keep reading the old copies.
  cmp -s "$new/Caddyfile" Caddyfile || caddy_changed=1
  cat "$new/compose.yml" > compose.yml
  cat "$new/Caddyfile" > Caddyfile
  cat "$new/seed.mjs" > seed.mjs
  [ -z "${caddy_changed:-}" ] || docker compose restart caddy
  # bash reads a script as it runs, so the new reset.sh replaces this one by
  # rename (the running copy keeps its inode) and takes over from the top.
  if [ -z "${DEMO_KIT_REFRESHED:-}" ] && ! cmp -s "$new/reset.sh" reset.sh; then
    chmod +x "$new/reset.sh"
    mv "$new/reset.sh" reset.sh
    rm -rf "$new"  # exec skips the EXIT trap
    DEMO_KIT_REFRESHED=1 exec ./reset.sh
  fi
else
  echo "Couldn't fetch the demo kit from main; resetting with the files on disk." >&2
fi
rm -rf "$new"  # now, since the seed below also leaves by exec

# Added after the first servers went up. startup.sh mints it too, but a VM still
# running an older startup.sh only ever gets it here.
if ! grep -q '^YARUKOTO_REVIEWER_TOKEN=' .env; then
  echo "YARUKOTO_REVIEWER_TOKEN=$(openssl rand -hex 24)" >> .env
fi

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
