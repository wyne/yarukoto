---
title: Deleting your account
description: How to permanently delete your Yarukoto account and what happens to your data.
---

Anyone in a household except its owner can delete their own account from the app. It's permanent
and can't be undone.

## How to delete it

1. Open **Settings**, and find **Household**.
2. Under **Your account**, tap **Delete my account**, and confirm.

You can do this from any device you're signed in on: your phone, a computer, or the web app at
your server's address in a browser. You don't need the phone app installed.

If you don't see **Delete my account**, either you're the household's owner (see below) or the
server is running an older version. Ask whoever runs it to update, or to remove your account for
you.

## What's deleted

Straight away, from the server:

- your account and the devices signed in to it, which are all signed out
- your private lists and their tasks
- your Inbox
- your own saved filters and folders

## What stays

- **Lists you shared** stay with the household, so the people using them don't lose them. They
  pass to the household's owner.
- **Backups.** The server keeps its own backup copies of the whole household, by default the last
  7 days of them. Your data drops out of those as they're replaced, so it's gone from the server
  completely within about a week.
- **Copies on your devices.** A device keeps what it last synced until the app is removed or
  signed out. Deleting the app removes it.

Yarukoto's developer never receives any of your data. It lives only on your household's server,
so deleting your account there is all it takes.

## If you're the owner

The owner's account is the server itself, so it can't be deleted from the app. To delete your data,
shut the server down and delete its data folder, including `data/backups`. That erases the whole
household. To hand the household to someone else instead, give them the server and its
`YARUKOTO_TOKEN`.
