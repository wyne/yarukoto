---
title: Deleting your account
description: How to delete your Yarukoto account, and what happens to your data.
---

Your Yarukoto account lives on your household's server, not with the people who make Yarukoto, so
you delete it there. No copy is kept anywhere else.

## If you're a member of a household

1. Open Yarukoto on any device you're signed in on. Without the app, open your household's server
   address in a browser and sign in.
2. Open the sidebar, tap the gear at the bottom, and go to **Account** (your name, at the top on a
   phone).
3. Tap **Delete my account** and confirm.

That device is signed out straight away, along with every other device signed in as you.

If you can't sign in any more, ask whoever runs your household's server. They can
[remove you](/using/household/#removing-a-person), which signs out your devices and hides your
data from everyone. Removing hides rather than erases, so it can be undone; erasing is only
available to you, from **Delete my account**.

If **Delete my account** isn't there, the server is older than account deletion and needs
[updating](/getting-started/docker/#updating).

## If you run the server

The household owner's account is the server's own, so deleting it means erasing everything on the
server:

1. Open Yarukoto on a device signed in as the owner, open **Settings**, and go to **Account**.
2. Tap **Erase all data** and confirm.

That erases every list, task, folder and saved filter, removes everyone else in the household, signs
out every device, and deletes the server's backups. The server keeps running, empty, with the same
access token; to get rid of it entirely, stop it and delete its `data` folder.

If **Erase all data** isn't there, the server needs [updating](/getting-started/docker/#updating).
Until then, stopping the server and deleting its `data` folder does the same.

## What's deleted and what's kept

When a member deletes their account, **erased immediately:**

- your account and every device's sign-in
- your Inbox, your private lists, and every task in them, along with their history
- every task you added to a shared list, which disappears from everyone's devices
- lists you shared, unless someone else's tasks are in them
- your folders, saved filters and view settings

**Kept, because others use it:**

- a list you shared that holds other people's tasks, which passes to the household owner
- other people's tasks you were assigned, which become unassigned

**Backups:** the server takes a backup once a day and keeps the newest seven by default, so a copy of
your data stays in those backups for about a week after you delete your account. Erasing all data as
the owner deletes the backups too. Whoever runs the
server can change that with `BACKUP_KEEP`; see [Backups](/self-hosting/backups/).

Signing out of a device or deleting the app only removes that device's copy. Your account stays on
the server until you delete it.

Yarukoto's developer never receives your tasks or account. They live only on your household's
server, so only that server can erase them. For questions about deleting your data, email
[yarukoto@justinwyne.com](mailto:yarukoto@justinwyne.com).
