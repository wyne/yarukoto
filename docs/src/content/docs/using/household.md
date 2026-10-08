---
title: Household
description: Add people, share lists, and manage who's signed in.
---

One Yarukoto server holds one household. Everyone in it gets their own account with a private
Inbox and private lists, and each person chooses which of their lists to share with everyone else.

The person who set up the server is the **owner**, an admin who signs in with the server's access
token. Everything below is under **Settings → Household**: open the sidebar and tap the gear at the
bottom.

## Adding a person

Only an admin can add people.

1. Under **Add a device**, choose **New person** and type their name.
2. Tap **Show a QR for them to scan**.
3. They scan it with their phone's camera. Yarukoto opens and signs them in as the new person.

If their device has no camera, they type the server address on the first screen and choose
**Sign in with a code**. With **New person** and their name filled in, enter the code they see and
tap **Approve**.

## Adding another device of your own

Choose **My device** (the only option if you aren't an admin) and tap **Show a QR to scan**, or
approve the code the new device shows. The device signs in as you. See
[Getting the apps](/using/apps/#connecting-to-your-server).

## Sharing a list

Lists are private to whoever made them until they're shared. To share one, long-press it in the
sidebar (right-click on a computer) and choose **Share with household**. Everyone in the household
then sees it and can add, edit and complete its tasks.

Only the person who shared a list can make it private again or delete it. Choosing **Make private**
hides it from everyone else again without deleting anything.

Your Inbox is always private.

## Devices

**Devices** lists everything that has signed in with a QR or a code, with when it was last seen.
Tap **Sign out** next to a device to revoke it. It will need a new code to sign in again. You see
your own devices; an admin sees everyone's.

## Removing a person

An admin can tap **Remove** next to someone under **People**. Their devices are signed out and their
private lists and tasks are hidden. Nothing is deleted: **Restore** brings it all back. Lists they
shared stay shared.

The owner can't be removed.

## Integrations

**Integration** approves a code shown by another service, such as
[Home Assistant](/integrations/home-assistant/). An integration sees only shared lists.

## Leaving

Anyone except the owner can delete their own account. See
[Deleting your account](/using/delete-account/).
