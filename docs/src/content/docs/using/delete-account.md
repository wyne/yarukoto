---
title: Deleting your account
description: How to delete your Yarukoto account, and what happens to your data.
---

Your Yarukoto account lives on your household's server, not with the people who make Yarukoto, so
you delete it there. No copy is kept anywhere else.

## If you're a member of a household

1. Open Yarukoto on any device you're signed in on. Without the app, open your household's server
   address in a browser and sign in.
2. Open the sidebar, tap the gear at the bottom, and go to **Household**.
3. Tap **Delete my account** and confirm.

That device is signed out straight away, along with every other device signed in as you.

If you can't sign in any more, ask whoever runs your household's server. They can
[remove you](/using/household/#removing-a-person), which signs out your devices and hides your
data from everyone. Removing hides rather than erases, so it can be undone; erasing is only
available to you, from **Delete my account**.

If **Delete my account** isn't there, the server is older than account deletion and needs
[updating](/getting-started/docker/#updating).

## If you run the server

The household owner's account is the server itself, so it has no **Delete my account**. To delete
it, stop the server and delete its `data` folder. That erases every account and every task on it,
including the backups in `data/backups`.

## What's deleted and what's kept

**Erased immediately:**

- your account and every device's sign-in
- your Inbox, your private lists, and every task in them, along with their history
- your folders, saved filters and view settings

**Kept, because they belong to the household:**

- lists you shared, which pass to the household owner
- tasks you added to shared lists

**Backups:** the server takes a backup once a day and keeps the newest seven by default, so a copy of
your data stays in those backups for about a week after you delete your account. Whoever runs the
server can change that with `BACKUP_KEEP`; see [Backups](/self-hosting/backups/).

Signing out of a device or deleting the app only removes that device's copy. Your account stays on
the server until you delete it.
