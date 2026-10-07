---
title: Limitations
description: Worth knowing before you rely on Yarukoto.
---

Worth knowing before you rely on it. For what's planned about them — and what's simply not built
yet — see [ROADMAP.md](https://github.com/wyne/yarukoto/blob/main/ROADMAP.md).

- **One household per server.** People in it get their own accounts and private lists, but it
  is not multi-tenant: the owner's `YARUKOTO_TOKEN` is an admin credential, so keep it secret.
- **Concurrent reorders can fight.** Task ordering is a single global value under last-write-wins,
  so two devices reordering the same list simultaneously can produce an interleaving neither chose.
  Everything else merges cleanly per record.
- **"Delete forever" is local-only.** It removes the task from that device immediately; the server
  drops it independently once the retention window elapses.
- **Per-task history has no UI.** The Activity tab shows recent changes across everything, but
  one task's full revision list is only at `GET /api/v1/tasks/:id/history`.
- **No export or import yet.** Your data is one SQLite file you own, and `/api/v1/tasks` reads it
  as JSON, but there is no one-click export or importer from other apps.

---
