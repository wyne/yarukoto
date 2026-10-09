---
title: Household
description: Add people, share lists, and manage who's signed in.
---

One Yarukoto server holds one household. Everyone in it gets their own account with a private
Inbox and private lists, and each person chooses which of their lists to share with everyone else.

The person who set up the server is the **owner**, an admin who signs in with the server's access
token. Everything below is in Settings: open the sidebar and tap the gear at the bottom. On a phone
it's under **Household**; on a computer it's the **Household** tab.

## Adding a person

Only an admin can add people.

1. Open **People** and tap **Add a person…** (on a computer, the **+** under People).
2. Type their name and tap **Show a QR for them to scan**.
3. They scan it with their phone's camera. Yarukoto opens and signs them in as the new person.

If their device has no camera, they type the server address on the first screen and choose
**Sign in with a code**. With **New person** and their name filled in, tap **Enter a code instead**,
enter the code they see and tap **Approve**.

## Adding another device of your own

Tap **Add a device…** (on a computer, the **+** under Devices). With **Me** chosen (the only option
if you aren't an admin), tap **Show a QR to scan**, or tap **Enter a code instead** and approve the
code the new device shows. The device signs in as you. See
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
To revoke one, tap it and confirm **Sign out** (on a computer, select it and click **Sign out…** or
the **−** under the list). It will need a new code to sign in again. You see your own devices; an
admin sees everyone's.

## Removing a person

An admin can tap someone under **People** and confirm **Remove** (on a computer, select them and
click **Remove…**). Their devices are signed out and their
private lists and tasks are hidden. Nothing is deleted: **Restore** brings it all back. Lists they
shared stay shared.

The owner can't be removed.

## Integrations

Under **Add a device**, **Integration** approves a code shown by another service, such as
[Home Assistant](/integrations/home-assistant/). An integration sees only shared lists.

## Leaving

Anyone except the owner can delete their own account. See
[Deleting your account](/using/delete-account/).
