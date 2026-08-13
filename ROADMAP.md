# Roadmap

What's left, in the order I'd tackle it. Each item says why it matters, where the code is, and
what "done" looks like — so it can be picked up cold.

The three phases of the original backend plan (client prep, server, client sync layer) are all
merged. The app syncs, persists, and survives restarts. Everything below is either unverified,
a gap the UI never grew, or a deliberate deferral.

---

## 1. Run the app on a simulator or device

**Nothing in the native path has ever been executed.** Every bit of verification so far was done
in the web build. That is a real gap, not a formality — the client is meant to be primarily a
phone app, and several things are native-only or changed startup:

- `mobile/src/data/storage.ts` uses AsyncStorage. On web it's localStorage underneath, which is
  what was actually exercised; the native backend never has been.
- `initStorage()` is awaited in `mobile/App.tsx` before anything renders. If it ever failed to
  resolve on device the app would sit on a blank screen.
- `mobile/src/data/ids.ts` uses `randomUUID()` from `expo-crypto`.
- The 5s sync loop keeps running while backgrounded; iOS may suspend timers differently.

**The build config is in place now** — `mobile/eas.json`, an `ios.bundleIdentifier`, and the ATS
keys below are committed, and `expo prebuild` produces a valid Xcode project. What is still
untouched is the part that needs a Mac: actually compiling and running it. See
[Building the iOS app](README.md#building-the-ios-app).

**Done when:** `npm run ios` (or `android`) launches, first-run connects to a server on the LAN,
a task created on the phone appears in the web client and vice versa, and force-quitting and
reopening keeps you signed in.

**Watch for:** the phone can't reach `localhost` — use the host's LAN IP, and note the server
listens on `0.0.0.0` already. HTTP to a LAN IP needs an ATS exception, which `mobile/app.json`
now carries as `NSAllowsLocalNetworking` plus `NSLocalNetworkUsageDescription` — if the very
first connection attempt fails silently, that permission prompt is the thing to check.

---

## 2. Lists and folders can't be deleted or renamed

The most visible functional hole. A mistyped list name is permanent, and an unwanted list can't
be removed.

The plumbing is already there — this is only missing UI plus two reducer actions:

- `ListDef`/`FolderDef` in `shared/types.ts` already extend `Synced`, so they carry `deletedAt`.
- The server already upserts and soft-deletes them (`server/src/routes/sync.ts`), and retention
  already hard-deletes expired ones (`server/src/retention.ts`).
- `mobile/src/data/TaskContext.tsx` has only `ADD_LIST`, `ADD_FOLDER`, and `UPDATE_LIST` — and
  `UPDATE_LIST` is wired solely to colour, via `setListColor`.

**Latent bug to fix at the same time:** `listsInFolder()` in `mobile/src/data/selectors.ts` does
not filter `deletedAt`, so a list tombstoned by another client would still render. It's currently
unreachable *because* nothing can delete a list — fixing one without the other reveals it.

**Done when:** a list can be renamed and deleted, tasks in a deleted list fall back to Inbox (or
are handled deliberately some other way), and the deletion reaches a second client.

---

## 3. Cache tasks locally for offline launch

Right now every launch does a full hydrate and starts from an empty list, so opening the app
without a connection shows nothing until sync completes. On a phone that's the common case.

This is a deliberate consequence of a bug fix, documented in `mobile/src/data/storage.ts`: the
sync cursor used to be persisted, which meant a reload started empty and then asked only for
changes *since* that cursor — so existing tasks were never re-fetched and the app looked wiped.
Keeping the cursor in memory made every launch correct by construction.

Caching the tasks themselves is what makes persisting the cursor worthwhile again: hydrate from
cache instantly, then sync incrementally in the background.

**Done when:** launching offline shows the last known tasks, and the sync cursor can be persisted
again without the empty-on-refresh failure returning. Add a regression test for that specific
case (see item 4).

---

## 4. There are no tests

Zero test runner, zero tests. `buildSampleData()` in `mobile/src/data/sampleData.ts` was
deliberately written pure and deterministic — ids from a per-call counter, every timestamp derived
from the injected `now` — precisely so it can back a suite. Nothing uses it yet.

Highest-value targets, roughly in order:

- `mergeBatch()` in `mobile/src/data/sync.ts` — last-write-wins and the skip-if-dirty rule are
  easy to regress and hard to notice by hand.
- The `updatedAt` stamping wrapper in `mobile/src/data/TaskContext.tsx`, which relies on array
  identity to detect what changed.
- `parseQuickAdd()` — pure, lots of cases, cheap to cover.
- Server sync upsert: rejecting a record older than the stored copy.

**Done when:** `npm test` runs in both packages in CI on every PR.

---

## 5. Task history has no UI

The server has captured a full snapshot of every task change since the schema existed — that was
deliberate, because history you didn't record is gone forever. It's still only reachable by hand:

```bash
curl -s localhost:8080/api/v1/tasks/<id>/history -H "Authorization: Bearer $YARUKOTO_TOKEN"
```

**Done when:** the task detail sheet lists revisions, and ideally restoring one writes the old
values back through the normal sync path.

---

## Deliberate limitations (not bugs)

These are known and accepted. Revisit only if they actually bite.

- **Concurrent reorders can interleave.** `order` is a single global number redistributed across
  a visible slice, under last-write-wins. Two devices reordering at once can produce an order
  neither chose. The fix, if ever needed, is fractional indexing between neighbours.
- **"Delete forever" is local-only.** `PURGE_TASKS` drops the row on that device; the server
  removes it independently once `TRASH_RETENTION_DAYS` elapses. The sync protocol only upserts,
  so there's nothing to push.
- **One shared token, no accounts.** Personal-instance design, not multi-tenant.
- **Plain HTTP by default.** The token rides as a bearer header on every request, so it needs a
  TLS-terminating proxy before facing the internet.
- **`viewOptions` stays device-local.** It's UI preference, not data.

---

## Traps already paid for

Documented in the README so they aren't rediscovered the hard way — worth reading before debugging
anything that smells like them:

- Never point `sqlite3` at the live database over the Docker bind mount (WAL isn't visible to a
  second process there, and a checkpoint from it can discard committed writes).
- Docker binds `:8080` on IPv6 while a local node process binds IPv4 — both succeed, and your
  browser and `curl` can silently reach different servers.
- `experiments.baseUrl` is baked in at build time, so the Pages build and the Docker build can't
  share one value.
