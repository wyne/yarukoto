---
title: Architecture
description: Repo layout, and how sync works.
---

## Repo layout

```
client/             Expo + React Native client for web, iOS, Android, and Mac
server/             Fastify + better-sqlite3 API server
packages/domain/    Types and domain logic shared by the client and server
windows/            Tauri shell around the client's web export
docs/               Starlight documentation site
custom_components/yarukoto/   Home Assistant integration (installed through HACS)
homeassistant-tests/          its tests, run with pytest-homeassistant-custom-component
```

The JavaScript projects form one npm workspace, with one install and one lockfile at the root.
Keeping the domain types and pure logic in `packages/domain/` means the client and server can't
drift apart silently — the server compiles against the same `Task` shape and filtering rules the
UI uses.


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


## Design origins

This started as an HTML/CSS prototype from [Claude Design](https://claude.ai/design). The original
handoff bundle — the design files and the conversation that produced them — has been removed now
that the app itself is the reference; it was never used at build time. It remains in the git
history if you ever want it back.
