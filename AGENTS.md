# Yarukoto

`client/` (Expo client for web, iOS, Android, and Mac), `server/` (Fastify + SQLite), and
`packages/domain/` (the shared domain package both compile against). `windows/` packages the client's
web export as a Windows app (Tauri), and `docs/` contains the Starlight documentation site.
Subdirectories may add their own `AGENTS.md`; those apply on top of this file.

## Backend/Mobile Compatibility

A user's server is updated on their schedule, and their phone updates on the App
Store's. Assume the two are never on the same build. Optional backend-backed
features are therefore **negotiated at runtime, never inferred** — not from the app
version, not from the server version string, not from whether a pull happened to
return the field.

The protocol, whenever a feature needs backend storage:

1. Add a stable id to `SERVER_FEATURES` in `packages/domain/src/types.ts`. Ids are permanent —
   they outlive every deployed client, so don't rename or recycle one.
2. Advertise it from `GET /api/v1/health` only once the backend can actually
   persist *and* sync the data. Advertising early is what corrupts data.
3. Gate the client UI with `supportsFeature(id)`, so a feature the server cannot
   keep is never offered.
4. Strip that feature's fields before `POST /sync` when the server has not
   advertised it.

### Three states, not two

A feature is supported, unsupported, or **unknown** — and unknown is its own case.
A server that answered `/health` and left an id out is unsupported. A probe that
failed, or a cached snapshot from before this client ever probed, is unknown. (An
answer with no `features` array at all is *unsupported*, not unknown: that server
predates the mechanism.)

Unknown does not get one blanket answer, because the two decisions it feeds have
opposite failure costs. `POST /sync` upserts whole rows, so:

- Sending a field the server has never heard of is **harmless** — it is ignored.
- Omitting a field the server *does* support is **destructive** — the upsert
  overwrites the stored value with an empty one.

So, under uncertainty:

| | supported | unsupported | unknown |
|---|---|---|---|
| Show the UI? | yes | no | **no** — offering an unconfirmed capability is wrong on screen but self-corrects on the next probe |
| Send the field? | yes | no | **yes** — a strip cannot be undone, so never strip on a guess |

Hiding UI while still sending the field is the intended combination, not a
contradiction: it declines to let the user configure something that may not stick,
without destroying what is already stored.

### Probing

`/health` is unauthenticated and answers what build is running. Probe it on connect
and refresh on a slow timer (`FEATURE_PROBE_MS`) — a feature list only changes when
the server is redeployed, so it must not ride along on every sync tick. Cache the
answer in the local server snapshot so a cold start is not a blind one, and resolve
the current cycle's value *before* pushing rather than through React state that
lands a render later.

Local and sample mode have no backend to negotiate with and are treated as fully
capable.

## Notification actions

A reminder notification carries **Mark done** and **Snooze**, and both have to work
with the app killed — that is the only state a lock-screen button is interesting in.
Neither platform lets JavaScript be the thing that answers.

- **iOS** catches the tap in `client/modules/notification-actions`, a local Expo
  module whose handler registers during `didFinishLaunchingWithOptions`. Expo's own
  response listeners come up with the JS bundle, which is too late: the process can
  be suspended again before React Native finishes booting, and the tap is gone.
- **Android** uses a headless task (`registerTaskAsync`), the one platform where
  expo documents an action tap reaching JS from a terminated app.

Both write the action to a durable queue — UserDefaults on iOS, AsyncStorage on
Android — *before* attempting anything else, and the app folds the queue into state
on its next run. The queue is what makes the tap survivable; the network call is
best-effort by nature, because a phone out of signal cannot reach a server.

### Why completion has its own endpoint

`POST /api/v1/tasks/:id/complete` exists for these handlers, and is a
deliberate exception to "backend features are negotiated through `SERVER_FEATURES`".

`POST /sync` upserts **whole rows**. Using it from a notification handler would mean
holding the complete task — which native code cannot read out of AsyncStorage
cleanly — and reimplementing `pushDirty`'s feature negotiation in a second language,
where a wrongly stripped field silently destroys stored data. That is precisely the
failure the negotiation protocol exists to prevent, so the answer is not to
reimplement it more carefully but to use a call that cannot commit it: a task id and
a timestamp, touching one column.

That is also why the endpoint carries no feature id. There is nothing to negotiate —
an older server 404s, the handler leaves the entry queued, and the app syncs it
through the normal outbox on next launch, which is where it was headed anyway. Add a
feature id only if some future action *does* need to write whole rows.

Snoozes never reach the server at all. A snooze says "not on this screen, not yet",
which is a fact about one phone's notifications rather than about the task, so it
lives in device-local storage and is rebuilt into scheduled notifications by the same
reconciler that owns reminders — one authority over both prefixes, because two would
each cancel the other's work.

## Task API and MCP

`server/src/taskService.ts` is the one place non-client callers write tasks: the REST
`/api/v1/tasks` routes, the MCP tools at `/mcp` (`server/src/mcp.ts`), and the
notification complete endpoint. It exists for the same reason that endpoint does —
a caller that doesn't hold the whole row must never go through `POST /sync`. Each
write reads the stored row, merges only the fields it was given, and goes through
`upsertTask`, so history and pull cursors see it like any synced edit.

None of this is negotiated through `SERVER_FEATURES`: the app never calls these
routes, so there is no UI to gate and no field to strip.

Saved filters are the one synced record these routes read but never write:
`GET /api/v1/filters/:id/tasks` evaluates the stored criteria with the shared
`filterTasks` (`packages/domain/src/taskFilter.ts`), not with SQL, so a filter admits the same
tasks on the server as it does in the app. Keep it that way — a second
implementation of "due today" would drift from the first.

Relative dates ("today", "fri") resolve in `YARUKOTO_TZ` via `wallClockNow`, never
in the server process's own zone, which in a container is usually UTC. The quick-add
parser lives in `packages/domain/` so both sides read the same syntax.

## Household

People, devices and sign-in live in `server/src/household.ts`; who can see what lives in
`server/src/access.ts`, and nowhere else. Every read that can return a task or list — sync,
the task API, MCP, history, saved filters — filters with `taskVisibleSql` / `listVisibleSql`,
and every write checks against them. Don't restate the rule in a route.

`YARUKOTO_TOKEN` is the owner (`u-owner`, an admin), so a client that predates households
keeps working exactly as before. For the same reason the server treats a missing `shared` on a
list, or a missing `assigneeId` on a task, as "not sent" and keeps the stored value: an older
build's whole-row push must not unshare a list or unassign a task.

When a write changes who can see a row without changing the row itself — sharing a list,
removing or restoring a person — bump `server_updated_at` on every affected row. That is what
puts them in the next pull, where they come back as rows to some people and as `removed` ids to
others. Nothing is ever hard-deleted for visibility; removing a person hides, never destroys.

The one exception is a person deleting their own account (`DELETE /api/v1/me`, behind the
`deleteAccount` feature). The App Store requires that to erase rather than hide, so it removes
what only they could see and hands any shared list they made to the owner. An admin removing
someone else stays soft.

## Releases

GitHub releases and `v*` tags in this repo are the Home Assistant integration's, and nothing
else's: HACS reads every release as a new version of it. `.github/workflows/ha-release.yml`
publishes one when the `version` in `custom_components/yarukoto/manifest.json` changes on main,
so bump that version in the PR rather than tagging by hand. The app ships through the stores and
the server is identified by its commit, so neither gets a GitHub release.
