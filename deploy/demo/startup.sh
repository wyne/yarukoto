#!/bin/bash
# Google Compute Engine startup script for the App Review demo server.
#
# Runs as root on every boot. The first boot installs Docker, fetches the demo
# files from the main branch, mints the access token and seeds the data; later
# boots just bring the containers back up. The domain comes from the instance's
# `demo-domain` metadata (see README.md).
set -euo pipefail

DIR=/opt/yarukoto-demo
RAW=https://raw.githubusercontent.com/wyne/yarukoto/main/deploy/demo
META=http://metadata.google.internal/computeMetadata/v1/instance/attributes

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

mkdir -p "$DIR/data"
cd "$DIR"
for f in compose.yml Caddyfile seed.mjs reset.sh; do
  curl -fsSL "$RAW/$f" -o "$f"
done
chmod +x reset.sh

if [ ! -f .env ]; then
  domain=$(curl -fsS -H 'Metadata-Flavor: Google' "$META/demo-domain")
  {
    echo "DEMO_DOMAIN=$domain"
    echo "YARUKOTO_TOKEN=$(openssl rand -hex 24)"
    echo "YARUKOTO_TZ=America/Los_Angeles"
  } > .env
  chmod 600 .env
fi

# Nightly at 3am Pacific (11:00 UTC) — after a US reviewer's day.
echo "0 11 * * * root $DIR/reset.sh >> /var/log/yarukoto-demo-reset.log 2>&1" > /etc/cron.d/yarukoto-demo

docker compose pull -q
if [ -f data/yarukoto.db ]; then
  docker compose up -d
else
  ./reset.sh
fi
