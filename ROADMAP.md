# Roadmap

What's left, in the order I'd tackle it. Each item says why it matters, where the code is, and
what "done" looks like — so it can be picked up cold.

The three phases of the original backend plan (client prep, server, client sync layer) are all
merged. The app syncs, persists, and survives restarts — now genuinely across restarts, not just
within a session: tasks are cached locally (`mobile/src/data/cache.ts`) so a launch with no
connection shows the last-known list instead of an empty one, a queued outbox edit survives the
process dying, and a service worker (`mobile/public/sw.js`) gives the installed web app a shell
to load into when there's no network at all. That work also cleared out three latent correctness
bugs in the sync path (an outbox race that could silently lose an edit made mid-push, `view_prefs`
comparing a client clock to a server cursor, and a 409 recovery that couldn't act on a hard
delete) and some platform-specific tuning (gzip on the server, exponential backoff and chunked
pushes on the client). Everything below is either unverified, a gap the UI never grew, or a
deliberate deferral.

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

## 2. Finish test coverage

A harness exists now (`node --test` via `tsx`, no bundler, `npm test` runs in both packages) and
covers what the sync mechanism audit touched: `Outbox`/`pushDirty`/`mergeBatch`/`mergeFullHydrate`
in `mobile/src/data/sync.ts`, `cache.ts`'s validation (including a regression test pinning the
exact cursor-without-data bug `storage.ts` documents), and the server's `view_prefs` clock-skew
fix exercised end-to-end through real routes. Not yet covered, from the original list:

- The `updatedAt` stamping wrapper in `mobile/src/data/TaskContext.tsx`, which relies on array
  identity to detect what changed.
- `parseQuickAdd()` — pure, lots of cases, cheap to cover.
- `buildSampleData()` in `mobile/src/data/sampleData.ts` — written pure and deterministic (ids
  from a per-call counter, every timestamp derived from the injected `now`) precisely so it can
  back a suite. Nothing uses it yet.

**Done when:** the list above is covered too, and `npm test` runs in both packages in CI on every
PR (no workflow does yet — the harness exists, but nothing invokes it automatically).

---

## 3. Task history has no UI

The server has captured a full snapshot of every task change since the schema existed — that was
deliberate, because history you didn't record is gone forever. It's still only reachable by hand:

```bash
curl -s localhost:8080/api/v1/tasks/<id>/history -H "Authorization: Bearer $YARUKOTO_TOKEN"
```

**Done when:** the task detail sheet lists revisions, and ideally restoring one writes the old
values back through the normal sync path.

---

## Considered and deferred: realtime updates

Sync polls every 5 seconds in the foreground, so a change made on one device can take that long to
appear on another. The obvious reach is WebSockets. It isn't the right first move, and the reasoning
is worth keeping so it doesn't get relitigated from scratch.

**The cheap wins came first and are already done.** A client now syncs the instant it comes to the
foreground, and backs off to a slow tick when it isn't. Latency you actually *notice* is latency at
the moment you pick up a device, and that is now near zero. Side-by-side windows are the one case
polling still loses — and they're the least representative way the app gets used.

**If that stops being enough, use SSE rather than WebSockets.** The requirement is one-directional:
*"something changed, go pull."* The client then syncs through the endpoint it already has, with the
auth it already has. `EventSource` reconnects by itself, and it's ordinary HTTP, so a reverse proxy
is far likelier to pass it untouched. WebSockets add full duplex nothing here needs, and DSM's
reverse proxy requires WebSocket support enabled per rule — a new failure mode on precisely the path
that produced the clock-skew bug.

**Either way, polling stays.** Missed messages, sleep/wake, and iOS suspending connections in the
background all mean a push channel can only ever be an accelerator over a poll that still has to be
correct on its own. That second code path — able to disagree with the first — is the real cost, not
the transport.

**Worth doing when:** two devices are genuinely used side by side often enough that 5 seconds
grates. Until then it's a second sync path to keep honest for no felt benefit.

---

## Considered and deferred: native reachability signal

On web, a `window.online` listener triggers an immediate sync the moment the connection comes
back, rather than waiting out the exponential backoff. There's no equivalent on native yet.

**The native equivalent is `@react-native-community/netinfo`, and it's a native module** — taking
it on means a new `expo prebuild`. Item 1 above is still open: nothing in the native path has ever
been executed, and adding a native dependency before that first run would muddy exactly the build
it's trying to verify.

**What already covers it:** the exponential backoff caps out at the same slow idle tick regardless,
and foregrounding the app already triggers an immediate cycle — so the gap is narrow (an
unattended background app, backgrounded, whose connectivity returns) and the existing behavior
degrades to "wait out the backoff" rather than anything broken.

**Worth doing when:** the app has actually run on a device and that gap turns out to matter in
practice, not before.

---

## Considered and deferred: one sync loop per browser tab

Each open tab runs its own independent poller and does its own full hydrate on load. Three tabs
open on the same account is three times the polling and three times the initial hydrate cost.

**The fix would be a `BroadcastChannel` leader election** — one tab actually polls, the rest listen
for its results. That's a second code path (leader/follower state, handling the leader tab closing)
for a scenario this app's own design argues against: it's built for one person on one device at a
time, and multiple tabs on the same account is the least representative way it gets used, same
reasoning as the realtime-updates deferral above.

**Worth doing when:** it actually shows up as a real cost — a slow connection where three parallel
hydrates on load are felt, or a server CPU/battery concern from redundant polling. Until then it's
not worth the second code path.

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
