---
title: REST API
description: Endpoints under /api/v1, and how household access applies to them.
---

All endpoints are under `/api/v1` and require `Authorization: Bearer <token>`, except `/health`.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Unauthenticated liveness check; also reports the running build (`version`, `commit`, `commitShort`, `builtAt`) and optional backend `features`. |
| `GET /sync?since=<iso>` | Changes since a cursor, including trashed rows. Omit `since` for a full hydrate. |
| `POST /sync` | Upsert tasks/lists/folders/view prefs. Rejects any record older than the stored copy and returns the authoritative version. |
| `GET /tasks/:id/history` | Revisions for one task, newest first. |
| `GET /tasks` | Search tasks: `status` (`open`, `completed`, `all`, `trash`), `listId` (or `inbox`), `tag`, `dueFrom`, `dueTo`, `q`, `limit`. |
| `GET /tasks/:id` | One task. |
| `POST /tasks` | Create a task from fields, or from quick-add `text` (`"pay rent fri 6pm #home !high ~Admin"`). |
| `PATCH /tasks/:id` | Change only the fields sent. `dueDate: null` clears the date, its time and its reminders. |
| `DELETE /tasks/:id` | Move to Trash. `POST /tasks/:id/restore` brings it back. |
| `POST /tasks/:id/complete` | Check off with a device timestamp; a stale tap loses to a later edit. Used by notification actions. |
| `GET /lists` | Every list the caller can see, with its id. |
| `GET /filters` | Saved filters. `GET /filters/:id/tasks` evaluates one now, exactly as the app does. |
| `GET /backup` | *(admin)* A consistent snapshot of the whole database, as a SQLite file download. |
| `POST /pair/start` | *(no token)* Begin signing in a device: returns a short `code` to show and a `secret` to poll with. |
| `POST /pair/poll` | *(no token)* `{ pairingId, secret }` → `pending`, or the device's own token once approved. |
| `POST /pair/approve` | Approve a code `as` `self` (another device of yours), `member` (a new person, with `name`; admin only) or `integration` (Home Assistant; admin only). |
| `GET /me` | Who the token belongs to, and everyone in the household. |
| `DELETE /me` | Delete your own account, permanently: your devices, private lists, Inbox, folders and filters are erased, and shared lists you made pass to the owner. The owner can't delete itself. |
| `GET /household` | People and devices. An admin sees everyone's, including removed people. |
| `PATCH /users/:id` | Rename yourself (or anyone, as an admin). |
| `DELETE /users/:id` | Remove a person (admin). Soft: they are signed out and their things hidden. `POST /users/:id/restore` brings them back with everything. |
| `DELETE /devices/:id` | Sign a device out. Your own, or anyone's as an admin. |

## Household

`YARUKOTO_TOKEN` is the household's owner, an admin, so existing setups keep working unchanged
and everything they already hold starts out private to the owner. Everyone else signs in by code,
with no passwords: a device calls `/pair/start` and shows the code, someone already signed in
approves it, and the device's next `/pair/poll` receives a token of its own, revocable from
`/household`.

A list is private to its owner until it is shared; tasks follow their list, and the Inbox is
always per person. A household integration sees shared lists only. Every endpoint, sync and MCP
included, applies the same rule.

The `/tasks` routes are for scripts and tools, not the app: each one reads the stored row, merges
only what it was sent, and writes history, so a caller never has to hold a whole task the way
`POST /sync` requires. The app picks the change up on its next pull.

The `notes` field is Markdown. REST and MCP callers read and write the Markdown source unchanged;
clients that do not render Markdown still see ordinary plain text.
