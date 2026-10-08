---
title: Configuration
description: Every environment variable the server reads.
---

Set these in `docker-compose.yml` or your `.env`.

| Variable | Default | What it does |
|---|---|---|
| `YARUKOTO_TOKEN` | *(required)* | The owner's admin token, and the bootstrap credential before anyone has signed in. The server refuses to start without it. |
| `YARUKOTO_TOKEN_FILE` | | Read the token from this file instead, for Docker/Compose secrets (`/run/secrets/…`). Set this or `YARUKOTO_TOKEN`, not both. |
| `PORT` | `8080` | Port the server listens on. |
| `DATABASE_PATH` | `/data/yarukoto.db` | SQLite file location. |
| `TRASH_RETENTION_DAYS` | `30` | How long soft-deleted tasks stay restorable before being hard-deleted. |
| `HISTORY_REVISIONS_PER_TASK` | `50` | Snapshots kept per task. `0` disables history entirely. |
| `YARUKOTO_TZ` | `TZ`, else the container's zone | IANA zone (`America/New_York`) the task API and AI tools use for "today", weekdays and times. Containers usually run in UTC, so set this. |
| `BACKUP_INTERVAL_HOURS` | `24` | How often the server snapshots the database. `0` turns automatic backups off. See [Backups](/self-hosting/backups/). |
| `BACKUP_KEEP` | `7` | Snapshots kept; older ones are deleted. |
| `BACKUP_DIR` | `backups/` next to the database | Where snapshots go. Mount a second volume here to put them on other storage. |
| `PUID` / `PGID` | `1000` / `1000` | The user and group the server runs as inside the container, and that it makes the owner of `/data`. Set them to your host user's ids (`id -u`, `id -g`). Ignored if you start the container with `--user`. |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error` or `fatal`. Logs are JSON on stdout. |
| `TRUST_PROXY` | off | Behind a reverse proxy, set this so logs show the client's address rather than the proxy's: `true` trusts every hop, a number trusts that many, or give the proxy's addresses or CIDRs (`172.16.0.0/12`). Leave it off when nothing sits in front, or clients can claim any address. |
| `WEB_ROOT` | `/app/web` *(set in the image)* | Where the built web client lives. If missing, the server runs API-only and says so in its logs. |
