---
title: Home Assistant
description: Show Yarukoto lists and saved filters as Home Assistant to-do lists.
---

`custom_components/yarukoto` shows Yarukoto lists and saved filters as Home Assistant to-do lists.
Changes made in Home Assistant show up in the app on its next sync. It polls every 30 seconds.

- **A list** works both ways: tick items off, edit and delete them, and add new ones, which go
  into that list.
- **A saved filter** (say, everything tagged `#ha`, or due today) can be ticked off, edited and
  deleted, but not added to. A filter can span lists and match on tags or dates, so there is no
  one place a new item could go and be sure to show up.

To install it:

1. In HACS, open **Custom repositories**, add `https://github.com/wyne/yarukoto` as an
   **Integration**, and install **Yarukoto**. Restart Home Assistant.
2. Add the **Yarukoto** integration and enter your server's address.
3. Home Assistant shows a sign-in code. On a device signed in as an admin, open Settings and
   choose **Add a device** (on a computer, the **+** under Devices on the **Household** tab). Pick
   who it's for and enter the code:
   - **Integration**, which sees only lists shared with the household, never anyone's private
     lists or Inbox. Right for a Home Assistant other people use.
   - **Me**, which sees everything you see, private lists and Inbox included. Choose
     **Enter a code instead** to get the code field.
4. Pick which lists and saved filters become to-do lists. Saved filters are made in the app,
   under Browse.

Home Assistant shows up under Devices in the app, where signing it out makes Home Assistant ask to
sign in again. Deleting an item moves the task to the app's Trash.

Due times are shown and written in Home Assistant's own time zone, so set it to match
`YARUKOTO_TZ`. It needs a server new enough to advertise `household` in `/api/v1/health`.

HACS offers an update whenever a new release is published. Releasing is just bumping `version`
in `custom_components/yarukoto/manifest.json`: once that reaches main, `ha-release.yml` tags it
and publishes the release.
