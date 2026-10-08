---
title: Feature compatibility
description: How the app and server negotiate optional features at runtime.
---

Your server updates when you pull a new image; the app updates when the App Store
says so. The two are rarely on the same build, so optional backend-backed features
are negotiated at runtime rather than guessed from a version number.

Feature ids live in `shared/types.ts` as `SERVER_FEATURES`. The server advertises the
ids it supports in the `/health` response, the app probes that on connect and
refreshes it on a slow timer, and it caches the answer alongside the local snapshot
so a cold start isn't a blind one. Anything the server leaves out, the app hides and
stops sending.

Reminders are the current example: on a server that doesn't list `taskReminders`, the
app hides the Reminders row and omits `task.reminders` from its pushes, so an older
backend is never handed a field it would drop on the floor.

**Unknown is its own case.** A server that answered and left an id out is
unsupported; a `/health` probe that failed is merely unknown, and the app handles the
two differently. `POST /sync` upserts whole rows, so sending a field the server never
heard of is harmless — it's ignored — while omitting one it *does* support overwrites
the stored value with an empty one. So against an unknown server the app hides the UI
(wrong on screen, and it self-corrects on the next probe) but still sends the field
(a strip can't be undone). Only a server that actually answered gets fields stripped.

Adding a backend-backed feature:

- Add a stable id to `SERVER_FEATURES`. Ids outlive deployed clients, so they're
  never renamed or recycled.
- Advertise it from `/health` only once the backend can persist *and* sync the field.
- Gate the client UI with `supportsFeature(id)`.
- Strip the field before `POST /sync` when the id isn't advertised.
- Leave local and sample mode fully capable — there's no backend there to negotiate
  with.
