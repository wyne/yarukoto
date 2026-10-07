---
title: Synology NAS
description: Run Yarukoto as a Container Manager project on a Synology NAS.
---

Container Manager can run this as a **Project** without cloning the repo or building anything —
`main` publishes a prebuilt image to `ghcr.io/wyne/yarukoto` for `linux/amd64` and `linux/arm64`,
which covers both the Intel and ARM Synology models.

Use [`docker-compose.synology.yml`](https://github.com/wyne/yarukoto/blob/main/docker-compose.synology.yml): it pulls the same image as the
main compose file, with NAS paths and every setting explained inline for pasting into Container
Manager. Never add the `docker-compose.build.yml` override on a NAS; building the image there is
slow and can run out of memory.

1. **Make a folder** in File Station for the database, e.g. `docker/yarukoto/data`.
2. **Generate a token** on any machine: `openssl rand -hex 32`
3. **Container Manager → Project → Create.** Point it at a folder, choose *Create docker-compose.yml*,
   and paste in [`docker-compose.synology.yml`](https://github.com/wyne/yarukoto/blob/main/docker-compose.synology.yml).
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

## Updating the NAS

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
