#!/bin/sh
# Drops root before starting the server.
#
# The container starts as root only so it can fix ownership of /data: installs
# from before this script wrote the database as root, and a fresh bind mount is
# created root-owned by Docker. It then runs the server as PUID:PGID (default
# 1000:1000, the image's `node` user), so set those to your NAS or host user if
# you want the files on the host to belong to them.
#
# Started with `--user` (or `user:` in compose), it is already unprivileged and
# skips straight to the server; /data must then be writable by that user.
set -e

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  data_dir="$(dirname "${DATABASE_PATH:-/data/yarukoto.db}")"
  mkdir -p "$data_dir"
  # Only walk the tree when something is actually owned by someone else, so a
  # large data directory doesn't cost a full chown on every start.
  if [ -n "$(find "$data_dir" \( ! -user "$PUID" -o ! -group "$PGID" \) -print -quit)" ]; then
    chown -R "$PUID:$PGID" "$data_dir"
  fi
  if [ -n "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    chown "$PUID:$PGID" "$BACKUP_DIR"
  fi
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
