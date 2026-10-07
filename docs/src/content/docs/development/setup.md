---
title: Development setup
description: Run the server and client locally, and inspect the database safely.
---

Node 22+.

**Server** — needs a token and a writable database path:

```bash
cd server
npm install
YARUKOTO_TOKEN=devtoken DATABASE_PATH=./data/dev.db MIGRATIONS_DIR=./migrations npm run dev
```

**Client** — in a second terminal:

```bash
cd client
npm install
npm run web
```

`npm run ios` and `npm run android` compile the native app instead, which needs the platform
toolchain installed — see [Building the iOS app](/development/ios-and-android/).

The Expo dev server runs on a different port than the API, so the first-run screen will ask for
both the server URL (`http://localhost:8080`) and the token. That's expected — the
URL field is skipped only when the page is served by the API server itself.

> **Stop the container before running a dev server on the same port.** Docker binds `8080` on IPv6
> and a local `node` process binds it on IPv4, so both can hold it at once without either erroring.
> `localhost` then resolves to whichever the client prefers — meaning your browser and your `curl`
> can silently talk to *different servers*. If something on `8080` looks stale or wrong,
> `lsof -i :8080 -sTCP:LISTEN` is the first thing to check; a second listener is invisible to
> `docker compose ps`.

Type checking (there is no test runner yet):

```bash
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
```

## Inspecting the database

> **Don't point `sqlite3` at the database while the server is running.** The database lives on a
> Docker bind mount, and SQLite's WAL mode coordinates readers through a shared-memory file that
> bind mounts don't support. A second process therefore reads only the main file — showing stale
> results that silently omit recent writes — and a checkpoint from that process can discard
> committed transactions the server hasn't merged down yet. This is not theoretical; it cost us
> two rows while writing this README.

Query the API instead, which always reflects live state:

```bash
curl -s localhost:8080/api/v1/sync -H "Authorization: Bearer $YARUKOTO_TOKEN"
```

For real SQL, stop the server first so nothing else holds the file:

```bash
docker compose stop
sqlite3 data/yarukoto.db 'select id, title, updated_at from tasks;'
docker compose start
```
