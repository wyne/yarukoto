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
- **Real URLs on the web** — every view is an address (`/today`, `/inbox?listId=…`), so a reload
  stays where you were, Back retraces the views you visited, and a filtered list is a link you can
  bookmark.
- **Per-view grouping and sort** — each view keeps its own arrangement, synced with everything else,
  so a list set to group by tag and sort by priority looks that way on every device.
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

That also names the build that's running:

```json
{"ok":true,"version":"1.0.0","commit":"366ba58…","commitShort":"366ba58","builtAt":"2026-01-30T12:04:11Z"}
```

The same version and short sha appear in the app under the sidebar's server sheet,
so you can tell whether an instance actually picked up an update. `commit` is empty
for a local build unless you stamp it: `GIT_SHA=$(git rev-parse HEAD) docker compose
build`. Published images (`ghcr.io/wyne/yarukoto`) always carry it, and the short sha
matches their `sha-<short>` tag.

### Updating

```bash
git pull
docker compose up -d --build
```

Your database lives in `./data` on the host and is untouched by rebuilds.

---

## Running it on a Synology NAS

Container Manager can run this as a **Project** without cloning the repo or building anything —
`main` publishes a prebuilt image to `ghcr.io/wyne/yarukoto` for `linux/amd64` and `linux/arm64`,
which covers both the Intel and ARM Synology models.

Don't point Container Manager at this repo's `docker-compose.yml`: it uses `build:`, which would
make the NAS install several hundred npm packages, run the Metro bundler and compile
better-sqlite3 from source. That's slow on NAS hardware and can run out of memory. Use
[`docker-compose.synology.yml`](docker-compose.synology.yml) instead, which pulls the image.

1. **Make a folder** in File Station for the database, e.g. `docker/yarukoto/data`.
2. **Generate a token** on any machine: `openssl rand -hex 32`
3. **Container Manager → Project → Create.** Point it at a folder, choose *Create docker-compose.yml*,
   and paste in [`docker-compose.synology.yml`](docker-compose.synology.yml).
4. **Edit two things** in the pasted file: put your token in `YARUKOTO_TOKEN`, and correct the
   volume path if your data isn't on `volume1`.
5. **Build/start the project**, then open `http://<nas-ip>:8080` and paste the same token.

The token is written in plain text in the project file. That's normal for Container Manager — the
folder is only readable by NAS admins — but keep it out of anything you share.

If port 8080 is taken (DSM itself uses 5000/5001, and other packages often claim 8080), change the
left-hand side of `"8080:8080"` and use that port in the URL.

**Reaching it from your phone** means using the NAS's LAN address, not `localhost`. Over plain HTTP
that's fine on a home network; put it behind DSM's reverse proxy with a certificate before exposing
it to the internet, since the access token rides on every request.

### Updating the NAS

Merging to `main` rebuilds and pushes `ghcr.io/wyne/yarukoto:latest` automatically. **The NAS does
not notice.** It holds a local image already tagged `latest`, and nothing tells it a newer one
exists — `docker compose up -d` on its own reports "Running" and changes nothing. Something has to
*pull* first.

The reliable way, over SSH:

```bash
cd /volume1/docker/yarukoto && sudo docker compose pull && sudo docker compose up -d
```

`pull` fetches the new image, and `up -d` then recreates the container because the image it should
be running has changed. Downtime is a couple of seconds. Your database is in the mounted folder and
is untouched.

In Container Manager, the equivalent is to stop the project, re-pull the image from the Registry or
Image tab, then start the project again. The exact menu wording moves between DSM releases, which is
why the SSH command above is the one worth remembering — and it's what a scheduled task would run
anyway if you want this automated (DSM's Task Scheduler, running as root).

**Pinning instead of tracking `latest`.** Every build also publishes an immutable `sha-<short>` tag,
e.g. `ghcr.io/wyne/yarukoto:sha-366ba58`. Pinning one means updates only happen when you change the
file, and it gives you something exact to roll back to — `latest` cannot be rolled back, because the
name simply moves.

Since GitHub Actions builds and pushes on every merge, an update that breaks something is only ever
a compose-file edit away from being reverted, provided you noted the previous `sha-` tag.

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

The build-time subtlety: a Pages *project* site is served from `/<repo>/`, and the export
hard-codes absolute asset URLs. `mobile/app.config.js` reads `EXPO_BASE_URL` so the workflow can
set that prefix while the Docker build — which serves from the domain root — leaves it empty.
Setting it globally would break self-hosting. A user/org site or a custom domain needs no prefix.
The same value reaches the app itself as `process.env.EXPO_BASE_URL`, which is how the URL routing
knows what to strip off the front of the path.

The other one: Pages has no rewrite rules, so `/<repo>/today` is a request for a file that isn't
there. The workflow copies `index.html` to `404.html`, which is what Pages serves instead — the app
boots from it, reads the path and shows the right view. The self-hosted server does the same job
with a not-found handler.

---

## Building the iOS app

The same `mobile/` project that produces the web bundle builds the iOS app — the screens are
React Native either way, so there is no separate codebase to keep in step.

Native folders are not committed (`mobile/.gitignore` ignores `/ios` and `/android`); they are
generated from `app.json` + `app.config.js` on each build. Edit the config, not the generated
project.

**It ships iPhone-only.** `ios.supportsTablet` is `false`, so the App Store lists it for iPhone and
an iPad runs it in compatibility mode. Nothing is lost by that today: the wide layout — the sidebar
and schedule pane, everything behind `wide` — is a runtime `width >= 900` check, so it is already
unreachable on a portrait iPhone, and the web build gets it either way. Turning iPad on later is
that one flag plus iPad screenshots, on the same app record. The reverse — shipping iPad support
and then withdrawing it — is the direction Apple pushes back on, which is why it starts off.

### One-time setup

```bash
cd mobile
npm install
npm install -g eas-cli
eas login
eas init          # links the project and writes extra.eas.projectId into app.json
```

`eas init` is the only step that writes back to the repo. Everything else it needs —
`ios.bundleIdentifier`, the build profiles — is already committed.

> **The app builds under three identities so they can all live on the same device at once.**
> `production` is `com.wyne.yarukoto`, `development` is `com.wyne.yarukoto.dev` and `preview` is
> `com.wyne.yarukoto.preview`; each also gets its own icon (dev desaturated, preview hue-shifted
> red) and display name, switched by the `APP_VARIANT` env var in `mobile/app.config.js`. Changing
> the production identifier later means a new app record in App Store Connect.

### Build profiles

`mobile/eas.json` defines three, each baking in its `APP_VARIANT`:

| Profile | What it produces | Distribution |
|---|---|---|
| `development` | A dev-client build for a real device, loads JS from Metro. | `internal` — ad hoc, registered devices only |
| `preview` | A standalone release build, for trying one on a device without touching the store copy. | `internal` — ad hoc, registered devices only |
| `production` | A store build, with `autoIncrement` for the build number. | App Store |

All three need an Apple account: even the ad hoc profiles have to be signed against a team.

`cli.appVersionSource` is `remote`, so EAS keeps the build number on its side and bumps it per
production build. `version` in `app.config.js` seeds it on the first build and is otherwise
ignored — that is deliberate, it keeps build-number churn out of git.

### Which commands need a prebuild

Two different native projects are in play, and which one a command reads is the thing to keep
straight.

**`expo run:ios` and `expo run:android` compile the `mobile/ios` and `mobile/android` folders in
your working tree.** Those are generated, and they hold one variant at a time — the folder is even
named for it, `ios/Yarukotopreview.xcodeproj`. So switching variants means regenerating them, which
is why `ios:dev` chains `prebuild --clean` ahead of `run:ios`. Skip it and you rebuild whatever
variant was generated last, under its bundle id and its icon, whatever you set `APP_VARIANT` to on
the command line. Keep `APP_VARIANT` on both halves.

**`eas build` never reads those folders**, `--local` included. It builds from a git-based copy of
the repo, and `/ios` and `/android` are gitignored, so they aren't in it — EAS runs `expo prebuild`
itself inside the build with the profile's `env` applied, which is where `APP_VARIANT` comes from.
Nothing to prebuild first no matter which profile you're switching between, icons and bundle ids
come out right on their own, and the folders in your tree are left untouched.

The corollary of building from git: **uncommitted work is not in an EAS build.** The CLI prompts
when the tree is dirty.

To build the local iOS dev client and run it against Metro:

```bash
npm run ios:dev
npm run start:dev
```

The equivalent Android dev client commands are:

```bash
APP_VARIANT=development npx expo prebuild --clean
APP_VARIANT=development npx expo run:android
npm run start:dev
```

For local production builds:

```bash
# iOS
APP_VARIANT=production npx expo prebuild --clean
APP_VARIANT=production npx expo run:ios --configuration Release

# Android
APP_VARIANT=production npx expo prebuild --clean
APP_VARIANT=production npx expo run:android --variant release
```

Or have EAS build the variants:

```bash
eas build --platform ios --profile development
eas build --platform android --profile development
npx expo start --dev-client

eas build --platform ios --profile production
eas build --platform android --profile production
```

`npm run ios` is still available for a quick full native debug build, but when switching between
variants, prefer the explicit commands above so the regenerated native project matches the app id
you intend to build. For a quick check against Expo Go with no native build at all,
`npx expo start --go` still works.

### Building on your own machine, and installing it

Adding `--local` runs the same EAS build here instead of on EAS's workers — the quickest way to a
signed build on a device you own without waiting in a queue. It needs Xcode (or the Android SDK and
a JDK for `--platform android`), and it writes the artifact into the directory you run it from:

```bash
cd mobile
npx eas build --platform ios --profile development --local
npx eas build --platform ios --profile preview --local
```

Each produces a `build-<epoch-ms>.ipa` in `mobile/`, which is gitignored. Run them one at a time:
signing an ad hoc build can need a provisioning profile regenerating, and that asks.

Both of those profiles sign against the devices registered to the Apple team — `eas device:list`
shows them and `eas device:create` adds one. That list is baked into the signature at build time,
so a phone that wasn't registered when the IPA was signed refuses to install it: register it, then
build again.

Then put it on a paired device:

```bash
npm run install:ipa
```

`mobile/scripts/install-ipa.sh` lists the IPAs newest-first with their version, variant and age,
lists the paired devices, and installs the chosen one with `xcrun devicectl`. With `fzf` installed
you get a picker with an Info.plist preview; without it, a numbered menu. It installs one IPA per
run, so run it once per build. The phone has to be plugged in or reachable with Wireless Debugging
on, or the device list comes up empty.

The dev client is only half an app until Metro is serving the JS:

```bash
npm run start:dev
```

The preview build is standalone and runs on its own.

### Getting it onto TestFlight

Needs a paid Apple Developer Program membership and an app record in App Store Connect whose
bundle ID matches `mobile/app.config.js`. Create the record first — `eas submit` can do it for you
on the first run, but only if the identifier is free.

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

`eas submit` prompts for the Apple ID, team, and App Store Connect app ID on the first run and
remembers them; put them in `eas.json` under `submit.production.ios` if you'd rather not be asked.

Processing on Apple's side takes a few minutes, after which the build appears under TestFlight.
Internal testers (up to 100, on your team) get it immediately. External testers need Apple's
review of the *build*, which is lighter than App Store review but not instant.

> `ITSAppUsesNonExemptEncryption` is set to `false` in `mobile/app.config.js`. The app only uses
> encryption for HTTPS, which is exempt, and declaring that up front is what stops every single
> build from landing in TestFlight as "Missing Compliance" waiting on a manual answer.

### Why the app can talk to an HTTP server

iOS App Transport Security blocks plain HTTP, and the common Yarukoto setup is exactly that — a
server on your LAN at `http://192.168.x.x:8080`. `mobile/app.config.js` sets two Info.plist keys to
allow it:

- `NSAllowsLocalNetworking` permits HTTP to private-range and `.local` addresses. It is the
  narrow exception; `NSAllowsArbitraryLoads` would allow HTTP *everywhere* and draws questions at
  App Store review.
- `NSLocalNetworkUsageDescription` is the string in the permission prompt. Since iOS 14, reaching
  any device on the local network needs the user's consent, and without this key the connection
  fails rather than prompting.

Neither helps a server exposed over the internet on plain HTTP — that still needs HTTPS, which
is what you should be doing anyway. See [TLS](#tls).

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

**Two timestamps, deliberately.** `updated_at` is stamped by the client that made the edit and is
only ever used for that last-write-wins comparison, because resolving a conflict wants to know when
something was *edited*. `server_updated_at` is written by the server on every accepted upsert, and
is the only thing sync cursors compare against.

They have to be separate. Cursors handed out by `GET /sync` come from the server's clock, so
filtering on a client-stamped column compares two clocks that are never quite in step: an edit made
on a device running a few seconds behind the server arrives already older than a cursor another
device is holding, and `>` skips it on every subsequent pull. The record sits on the server, correct
and complete, and simply never reaches the other client until something happens to touch it again.
Sync appears to work "most of the time", which is the worst way for it to fail.

---

## API

All endpoints are under `/api/v1` and require `Authorization: Bearer <token>`, except `/health`.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Unauthenticated liveness check; also reports the running build (`version`, `commit`, `commitShort`, `builtAt`). |
| `GET /sync?since=<iso>` | Changes since a cursor, including trashed rows. Omit `since` for a full hydrate. |
| `POST /sync` | Upsert tasks/lists/folders/view prefs. Rejects any record older than the stored copy and returns the authoritative version. |
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
npm run web
```

`npm run ios` and `npm run android` compile the native app instead, which needs the platform
toolchain installed — see [Building the iOS app](#building-the-ios-app).

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
