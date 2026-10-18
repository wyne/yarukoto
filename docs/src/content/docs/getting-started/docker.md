---
title: Running it with Docker
description: Install Yarukoto with Docker Compose from the prebuilt image.
---

Requires Docker with Compose v2. Nothing is built on your machine: the compose file pulls the
prebuilt `ghcr.io/wyne/yarukoto` image (amd64 and arm64), so all you need is the compose file
itself.

```bash
git clone https://github.com/wyne/yarukoto.git
cd yarukoto
```

Generate an access token — this is the only credential, so make it a real random one:

```bash
echo "YARUKOTO_TOKEN=$(openssl rand -hex 32)" > .env
```

Start it:

```bash
docker compose up -d
```

Open <http://localhost:8080>. Because the page is served by the server itself, the app detects
that automatically and asks only for the access token — paste the value from your `.env`:

```bash
cat .env
```

To confirm it's healthy:

```bash
curl -fsS localhost:8080/api/v1/health
```

That also names the build that's running:

```json
{"ok":true,"version":"1.0.0","commit":"366ba58…","commitShort":"366ba58","builtAt":"2026-01-30T12:04:11Z","features":["taskReminders"]}
```

The short sha is what tells you whether an instance actually picked up an update, and
it's what the app shows as the server build in Settings. `version` stays `1.0.0`: the
server ships continuously from `main` rather than with app releases, so it is never
bumped and is not the app version you see in release notes. `commit` is empty
for a local build unless you stamp it: `GIT_SHA=$(git rev-parse HEAD) docker compose
build`. Published images (`ghcr.io/wyne/yarukoto`) always carry it, and the short sha
matches their `sha-<short>` tag.

## Updating

```bash
docker compose pull
docker compose up -d
```

Your database lives in `./data` on the host and is untouched by updates. Watchtower and similar
tools work too; pin a `sha-<short>` tag instead of `latest` if you'd rather choose when to move.

## Building from source

To build the image from your checkout instead of pulling it, layer
[`docker-compose.build.yml`](https://github.com/wyne/yarukoto/blob/main/docker-compose.build.yml) on top:

```bash
GIT_SHA=$(git rev-parse HEAD) docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

It runs the Metro bundler and compiles better-sqlite3, so give it a few GB of memory and a few
minutes. `GIT_SHA` is optional; it stamps the build so `/health` can name the commit.
