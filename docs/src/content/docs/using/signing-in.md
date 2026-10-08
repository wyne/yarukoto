---
title: Signing in
description: Connecting the apps to your server, by QR code, sign-in code or access token.
---

Yarukoto runs on iPhone, Android, Mac, Windows and in a browser. Every one of them is the same app
talking to the same server, so what you see on one shows up on the others.

The browser version needs no install: open your server's address, like
`https://todo.example.com`, and it signs you in from there. To try the app without a server at
all, choose **Explore with sample data** on the first screen, or open the
[live demo](https://wyne.github.io/yarukoto/).

## Three ways to sign in

**Scan a QR code.** The quickest way to add a phone. On a device that's already signed in, open
**Settings**, find **Household**, and choose **Show a QR to scan**. On the new phone, tap **Scan QR
code** and point the camera at it. It signs in with nothing to type. Each QR works once and
expires after 10 minutes.

**Sign in with a code.** For a device without a camera, or when the other device isn't nearby.
Enter your server's address and tap **Sign in with a code**. The new device shows a short code.
On a device that's already signed in, open **Settings › Household**, type the code under **Add a
device** and tap **Approve**. The new device finishes signing in by itself. A code also expires after 10 minutes.

**Use an access token.** The server's own token, `YARUKOTO_TOKEN`, signs in as the household's
owner. Use it for the very first device, or with a server too old for sign-in codes. Tap **Use an
access token**, then enter the server address and the token.

## Settings

On a phone, open the sidebar and tap the row at the bottom, next to the sync status. On a Mac,
Windows or in a browser, the same row sits at the bottom of the sidebar.

The dot in that row shows whether everything has synced. Changes you make while the server is out
of reach are kept on the device and sent the next time it can connect, so you can keep working
offline.

## Plain HTTP and your phone

A server on your home network is often reached by plain HTTP, like `http://192.168.1.20:8080`.

- **iPhone and Mac** connect to plain HTTP addresses on your local network. iOS asks once for
  permission to find devices on your network; allow it, or the app can't reach the server.
- **Android** needs HTTPS. Put the server behind a [reverse proxy with a
  certificate](/self-hosting/reverse-proxy/) to reach it from an Android phone.

Anything reached over the internet should use HTTPS whatever the device, because your sign-in
travels with every request.

## Getting help

Questions and bug reports go to [GitHub issues](https://github.com/wyne/yarukoto/issues).
