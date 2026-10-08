---
title: Reminders
description: Get notified when a task is due, then mark it done or snooze it from the notification.
---

A reminder is a notification on your phone about a task with a due date.

## Setting one

Give the task a date, then open **Reminders** in the task and pick one:

- **Due date**, at 9:00 AM or, if the task has a time, at that time
- **1 day**, **2 days** or **1 week before**, at 9:00 AM
- **Custom…**: any number of days or weeks before, at the time you choose

A task can have more than one reminder. Reminders sync with the task, so every phone that can see
the task reminds you. For a task in a [shared list](/using/household/#sharing-a-list), that means
everyone in the household gets the reminder.

The **Reminders** row only appears once the task has a date. If it doesn't appear at all, your server
is older than reminders and needs [updating](/getting-started/docker/#updating).

The first time you add one, the app asks for permission to send notifications. If you said no, turn
notifications on for Yarukoto in your phone's settings.

## From the notification

Each reminder has two buttons:

- **Mark done** completes the task.
- **Snooze 60 min** shows the reminder again in an hour.

Both work even when the app isn't running. If the phone can't reach your server at that moment,
the completion is kept on the phone and syncs the next time the app opens.

A snooze stays on the phone you snoozed it on. It doesn't change the task, and your other devices
still remind you at the original time.

## Where reminders work

- **iPhone and Android:** yes.
- **Web and Windows:** no. The web app and the Windows app don't show notifications, but reminders
  you set there still fire on your phone.

On **Android**, a reminder can arrive a few minutes after its time. Android groups app alarms
together to save battery, so a 9:00 reminder may show up at 9:02.
