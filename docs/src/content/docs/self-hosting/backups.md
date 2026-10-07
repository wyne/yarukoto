---
title: Backups
description: Built-in snapshots, on-demand backups and restoring.
---

Everything is one SQLite file, at `./data/yarukoto.db` on the host, and the server backs it up
itself. Once a day (a minute after startup, then every `BACKUP_INTERVAL_HOURS`) it writes a
complete, consistent snapshot to `./data/backups/yarukoto-<time>.db` and keeps the newest
`BACKUP_KEEP`. No downtime, no cron job.

**Point your backup tool at `./data/backups`, not at `yarukoto.db`.** Restic, Borg, Kopia, Hyper
Backup and the rest copy files from outside the container, and the live database can be missing
writes that only exist in its WAL (see [Inspecting the database](/development/setup/#inspecting-the-database)). A snapshot is written by the server
through SQLite's backup API and renamed into place when it's complete, so every file there is safe
to copy at any moment.

To pull one on demand, for example from a cron job on another machine, an admin token can
download a fresh snapshot:

```bash
curl -fsS -H "Authorization: Bearer $YARUKOTO_TOKEN" -o yarukoto.db https://todo.example.com/api/v1/backup
```

**Restoring** is copying a snapshot back over the live file while the server is stopped:

```bash
docker compose stop
rm -f data/yarukoto.db-wal data/yarukoto.db-shm
cp data/backups/yarukoto-2026-10-02T03-00-00Z.db data/yarukoto.db
docker compose start
```

Remove the `-wal` and `-shm` files first; they belong to the database you are replacing.

A restore rolls the server back, and devices don't roll back with it. Anything a device synced
after the snapshot stays in that device's local cache but is not sent again, so the server and
the device disagree until the task is next edited. A device that signed in after the snapshot
was taken is signed out, since its token isn't in the restored file.
