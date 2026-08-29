# Yarukoto

`mobile/` (Expo client), `server/` (Fastify + SQLite), and `shared/` (the types both
compile against). Subdirectories may add their own `AGENTS.md`; those apply on top of
this file.

## Backend/Mobile Compatibility

A user's server is updated on their schedule, and their phone updates on the App
Store's. Assume the two are never on the same build. Optional backend-backed
features are therefore **negotiated at runtime, never inferred** — not from the app
version, not from the server version string, not from whether a pull happened to
return the field.

The protocol, whenever a feature needs backend storage:

1. Add a stable id to `SERVER_FEATURES` in `shared/types.ts`. Ids are permanent —
   they outlive every deployed client, so don't rename or recycle one.
2. Advertise it from `GET /api/v1/health` only once the backend can actually
   persist *and* sync the data. Advertising early is what corrupts data.
3. Gate the mobile UI with `supportsFeature(id)`, so a feature the server cannot
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
