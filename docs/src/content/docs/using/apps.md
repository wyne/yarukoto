---
title: Getting the apps
description: Install Yarukoto on your phone or computer and connect it to your server.
---

Yarukoto runs on iPhone, Android, the Mac and Windows, and in any browser. Every one of them
keeps a copy of your tasks on the device, so the app opens instantly and works offline. Changes
sync with your server whenever it's reachable.

- **iPhone and Android:** install Yarukoto from the App Store or Google Play.
- **In a browser:** open your server's address. The server hosts the web app itself, so there's
  nothing to install.
- **Mac and Windows:** the desktop apps work like the web app, in their own window.

You need a [Yarukoto server](/getting-started/docker/) to connect to. To look around first, see
[Trying it without a server](#trying-it-without-a-server).

## Connecting to your server

The first screen offers three ways in. Which one fits depends on whether something is already
signed in.

**Scan a QR code** (phones). On a device that's already signed in, open the sidebar, tap the gear at
the bottom for Settings, and under **Household** choose **Show a QR to scan**. Scan it with the new
phone's camera. It opens Yarukoto and signs in with nothing to type, server address included. A QR
works once and expires after a few minutes.

**Sign in with a code.** Type your server's address and tap **Sign in with a code**. The app shows
a short code. On a device that's already signed in, enter that code under **Settings → Household**
and tap **Approve** (or tap **Scan its QR instead**). Use this for a device without a camera, or when
the signed-in device is a computer.

**Use an access token.** Type the server's address and the `YARUKOTO_TOKEN` from the server's
`.env`. This signs in as the household owner. Use it for the very first device, when nothing else is
signed in yet. Every device after that should sign in with a QR or a code, so the token stays on the
server.

Each device that signs in with a QR or a code gets its own sign-in, which shows under
**Settings → Household → Devices** and can be signed out from there on its own.

:::caution[Android needs HTTPS]
The Android app only connects to servers at an `https://` address. Android blocks plain HTTP, so
`http://192.168.1.20:8080` works from an iPhone or a browser on your home network, but not from
an Android phone. Put the server behind [a reverse proxy with a certificate](/self-hosting/reverse-proxy/)
to use it from Android.
:::

## Trying it without a server

Tap **Explore with sample data** on the first screen to use the whole app with a set of example
tasks. Nothing leaves the device, and the sample data resets when the app reloads. To connect to a
real server afterwards, open Settings and choose **Leave sample data**.

## Signing out

**Settings → Disconnect** forgets the server on this device and removes its copy of your tasks.
It doesn't ask first, and changes that haven't synced yet are lost, so check that the sync dot at
the bottom of the sidebar says everything is synced before you disconnect.

Disconnecting doesn't remove the device's sign-in from the server. To revoke it, sign the device
out under **Settings → Household → Devices** from another device. A device signed out that way
shows **Signed out** the next time it opens. Its tasks are still on it, and signing in again picks
up where it left off.
