# Yarukoto

A self-hosted todo app. One container, one SQLite file, your data on your own server.

The server serves both the API and the web client, so a single `docker compose up` gives you
a working instance. The same codebase builds an iOS/Android app via Expo.

> **Status:** working and usable, but young. Single-user by design (one shared access token,
> no accounts). See [Limitations](#limitations) before trusting it with anything important.

---

## Features

- **Lists and folders** — group tasks into lists, lists into folders.
- **Smart views** — All, Today, Upcoming, Inbox, plus per-list and per-tag filtering.
- **Plan and Calendar views** — day, 3-day, and week layouts, with a month grid above for jumping
  around. Drag a task onto a day to reschedule it.
- **Quick add with natural syntax** — `pay rent fri 6pm #home !high ~admin` parses the due date
  and time, the `#tag`, the `!priority`, and the `~list`. Anything unrecognized stays as the title.
- **Subtasks, notes, tags, priorities, due dates and times.**
- **Trash** — deleting is a soft delete. Restore from Trash, or delete forever. The server hard-deletes
  anything left there past its retention window.
- **Task history** — every change writes a full snapshot server-side, capped per task.
  Exposed at `GET /api/v1/tasks/:id/history`; there is no UI for browsing it yet.
- **Offline-tolerant sync** — the UI never waits on the network. Local changes queue in an outbox and
  push on the next cycle, so the app stays responsive when the server is unreachable. A dot at the
  bottom of the sidebar reports the real state: synced, syncing, changes pending, offline, or a
  rejected token.
- **Sample data mode** — try the whole app with seeded data, no server required.

---

## Running it with Docker

Requires Docker with Compose v2.

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

### Updating

```bash
git pull
docker compose up -d --build
```

Your database lives in `./data` on the host and is untouched by rebuilds.

---

## Configuration

Set these in `docker-compose.yml` or your `.env`.

| Variable | Default | What it does |
|---|---|---|
| `YARUKOTO_TOKEN` | *(required)* | Bearer token for every API request. No default — the server refuses to start without it. |
| `PORT` | `8080` | Port the server listens on. |
| `DATABASE_PATH` | `/data/yarukoto.db` | SQLite file location. |
| `TRASH_RETENTION_DAYS` | `30` | How long soft-deleted tasks stay restorable before being hard-deleted. |
| `HISTORY_REVISIONS_PER_TASK` | `50` | Snapshots kept per task. `0` disables history entirely. |
| `WEB_ROOT` | `/app/web` *(set in the image)* | Where the built web client lives. If missing, the server runs API-only and says so in its logs. |

### TLS

The default compose file serves plain HTTP, which is fine on a trusted network or behind an
existing reverse proxy. **The access token is sent as a bearer header on every request, so put it
behind HTTPS before exposing it to the internet** — Caddy or Traefik in front of this container is
the usual approach.

---

## Publishing a demo to GitHub Pages

`.github/workflows/pages.yml` builds the web client and deploys it to Pages on every push to
`main`. Enable it once under **Settings → Pages → Source → GitHub Actions**.

**It's a sample-data demo, not a usable instance.** Pages is HTTPS, and a self-hosted server on
plain HTTP is mixed content that browsers block — so "Connect" can't reach a local instance from
there. Visitors get "Explore with sample data", which runs entirely client-side.

The one build-time subtlety: a Pages *project* site is served from `/<repo>/`, and the export
hard-codes absolute asset URLs. `mobile/app.config.js` reads `EXPO_BASE_URL` so the workflow can
set that prefix while the Docker build — which serves from the domain root — leaves it empty.
Setting it globally would break self-hosting. A user/org site or a custom domain needs no prefix.

---

## Repo layout

```
mobile/    Expo + React Native client (also builds the web UI)
server/    Fastify + better-sqlite3 API server
shared/    Task/ListDef/FolderDef types, used by both sides
```

Keeping the types in `shared/` means the client and server can't drift apart silently — the
server compiles against the same `Task` shape the UI uses.

---

## How sync works

The client is the source of truth for what you see; the server is the source of truth for what
persists. Every mutation applies to local state immediately and marks the record dirty. A loop
pushes dirty records and pulls changes every 5 seconds.

Conflicts resolve **last-write-wins per record**, compared on `updatedAt`. Deletes are soft
(`deletedAt`), so a deletion propagates to other devices instead of the record reappearing on the
next pull. A pull whose cursor predates the retention window is rejected, and the client re-hydrates
fully — otherwise a client offline long enough could miss a hard delete and resurrect the task.

---

## API

All endpoints are under `/api/v1` and require `Authorization: Bearer <token>`, except `/health`.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Unauthenticated liveness check. |
| `GET /sync?since=<iso>` | Changes since a cursor, including trashed rows. Omit `since` for a full hydrate. |
| `POST /sync` | Upsert tasks/lists/folders. Rejects any record older than the stored copy and returns the authoritative version. |
| `GET /tasks/:id/history` | Revisions for one task, newest first. |

---

## Development

Node 22+.

**Server** — needs a token and a writable database path:

```bash
cd server
npm install
YARUKOTO_TOKEN=devtoken DATABASE_PATH=./data/dev.db MIGRATIONS_DIR=./migrations npm run dev
```

**Client** — in a second terminal:

```bash
cd mobile
npm install
npm run web     # or: npm run ios / npm run android
```

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
cd mobile && npx tsc --noEmit
cd server && npx tsc --noEmit
```

### Inspecting the database

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

---

## Backups

Everything is one SQLite file, at `./data/yarukoto.db` on the host.

The reliable way is to stop the server, copy, and start again — a few seconds of downtime buys a
guaranteed-consistent copy:

```bash
docker compose stop
cp data/yarukoto.db ~/backups/yarukoto-$(date +%F).db
docker compose start
```

If you must copy without stopping, take `yarukoto.db` **together with** `yarukoto.db-wal` and
`yarukoto.db-shm` — the `.db` file alone can be missing recent writes that still live in the WAL.
For the reason not to use `sqlite3 .backup` here, see the warning above.

---

## Limitations

Worth knowing before you rely on it. For what's planned about them — and what's simply not built
yet — see [ROADMAP.md](ROADMAP.md).

- **One shared token, no user accounts.** Anyone with the token has full access. This is a
  personal-instance design, not multi-tenant.
- **Concurrent reorders can fight.** Task ordering is a single global value under last-write-wins,
  so two devices reordering the same list simultaneously can produce an interleaving neither chose.
  Everything else merges cleanly per record.
- **"Delete forever" is local-only.** It removes the task from that device immediately; the server
  drops it independently once the retention window elapses.
- **Task history has no UI.** The data is captured from day one — because history you didn't record
  is gone forever — but reading it means calling the endpoint directly.
- **Reminders are not implemented.** The field was removed rather than left as dead UI; real
  delivery needs push tokens and a scheduler.
- **No automated tests yet.** `buildSampleData()` is written as a deterministic fixture specifically
  so it can back a test suite when one is added.

---

## Design origins

This started as an HTML/CSS prototype from [Claude Design](https://claude.ai/design). The original
handoff bundle — the design files and the conversation that produced them — has been removed now
that the app itself is the reference; it was never used at build time. It remains in the git
history if you ever want it back.
