---
title: Building the iOS and Android apps
description: EAS profiles, local builds, installing and TestFlight.
---

The same `client/` project that produces the web bundle builds the iOS app — the screens are
React Native either way, so there is no separate codebase to keep in step.

Native folders are not committed (`client/.gitignore` ignores `/ios` and `/android`); they are
generated from `app.json` + `app.config.js` on each build. Edit the config, not the generated
project.

**It ships iPhone-only.** `ios.supportsTablet` is `false`, so the App Store lists it for iPhone and
an iPad runs it in compatibility mode. Nothing is lost by that today: the wide layout — the sidebar
and schedule pane, everything behind `wide` — is a runtime `width >= 900` check, so it is already
unreachable on a portrait iPhone, and the web build gets it either way. Turning iPad on later is
that one flag plus iPad screenshots, on the same app record. The reverse — shipping iPad support
and then withdrawing it — is the direction Apple pushes back on, which is why it starts off.

## One-time setup

```bash
cd client
npm install
npm install -g eas-cli
eas login
eas init          # links the project and writes extra.eas.projectId into app.json
```

`eas init` is the only step that writes back to the repo. Everything else it needs —
`ios.bundleIdentifier`, the build profiles — is already committed.

> **The app builds under three identities so they can all live on the same device at once.**
> `production` is `com.wyne.yarukoto`, `development` is `com.wyne.yarukoto.dev` and `preview` is
> `com.wyne.yarukoto.preview`; each also gets its own icon (dev desaturated, preview hue-shifted
> red) and display name, switched by the `APP_VARIANT` env var in `client/app.config.js`. Changing
> the production identifier later means a new app record in App Store Connect.

## Build profiles

`client/eas.json` defines three, each baking in its `APP_VARIANT`:

| Profile | What it produces | Distribution |
|---|---|---|
| `development` | A dev-client build for a real device, loads JS from Metro. | `internal` — ad hoc, registered devices only |
| `preview` | A standalone release build, for trying one on a device without touching the store copy. | `internal` — ad hoc, registered devices only |
| `production` | A store build, with `autoIncrement` for the build number. | App Store |

All three need an Apple account: even the ad hoc profiles have to be signed against a team.

`cli.appVersionSource` is `remote`, so EAS keeps the build number on its side and bumps it per
production build. `version` in `app.config.js` seeds it on the first build and is otherwise
ignored — that is deliberate, it keeps build-number churn out of git.

## Which commands need a prebuild

Two different native projects are in play, and which one a command reads is the thing to keep
straight.

**`expo run:ios` and `expo run:android` compile the `client/ios` and `client/android` folders in
your working tree.** Those are generated, and they hold one variant at a time — the folder is even
named for it, `ios/Yarukotopreview.xcodeproj`. So switching variants means regenerating them, which
is why `ios:dev` chains `prebuild --clean` ahead of `run:ios`. Skip it and you rebuild whatever
variant was generated last, under its bundle id and its icon, whatever you set `APP_VARIANT` to on
the command line. Keep `APP_VARIANT` on both halves.

**`eas build` never reads those folders**, `--local` included. It builds from a git-based copy of
the repo, and `/ios` and `/android` are gitignored, so they aren't in it — EAS runs `expo prebuild`
itself inside the build with the profile's `env` applied, which is where `APP_VARIANT` comes from.
Nothing to prebuild first no matter which profile you're switching between, icons and bundle ids
come out right on their own, and the folders in your tree are left untouched.

The corollary of building from git: **uncommitted work is not in an EAS build.** The CLI prompts
when the tree is dirty.

To build the local iOS dev client and run it against Metro:

```bash
npm run ios:dev
npm run start:dev
```

The equivalent Android dev client commands are:

```bash
APP_VARIANT=development npx expo prebuild --clean
APP_VARIANT=development npx expo run:android
npm run start:dev
```

For local production builds:

```bash
# iOS
APP_VARIANT=production npx expo prebuild --clean
APP_VARIANT=production npx expo run:ios --configuration Release

# Android
APP_VARIANT=production npx expo prebuild --clean
APP_VARIANT=production npx expo run:android --variant release
```

Or have EAS build the variants:

```bash
eas build --platform ios --profile development
eas build --platform android --profile development
npx expo start --dev-client

eas build --platform ios --profile production
eas build --platform android --profile production
```

`npm run ios` is still available for a quick full native debug build, but when switching between
variants, prefer the explicit commands above so the regenerated native project matches the app id
you intend to build. For a quick check against Expo Go with no native build at all,
`npx expo start --go` still works.

## Building on your own machine, and installing it

Adding `--local` runs the same EAS build here instead of on EAS's workers — the quickest way to a
signed build on a device you own without waiting in a queue. It needs Xcode (or the Android SDK and
a JDK for `--platform android`), and it writes the artifact into the directory you run it from:

```bash
cd client
npx eas build --platform ios --profile development --local
npx eas build --platform ios --profile preview --local
```

Each produces a `build-<epoch-ms>.ipa` in `client/`, which is gitignored. Run them one at a time:
signing an ad hoc build can need a provisioning profile regenerating, and that asks.

Both of those profiles sign against the devices registered to the Apple team — `eas device:list`
shows them and `eas device:create` adds one. That list is baked into the signature at build time,
so a phone that wasn't registered when the IPA was signed refuses to install it: register it, then
build again.

Then put it on a paired device:

```bash
npm run install:ipa
```

`client/scripts/install-ipa.sh` lists the IPAs newest-first with their version, variant and age,
lists the paired devices, and installs the chosen one with `xcrun devicectl`. With `fzf` installed
you get a picker with an Info.plist preview; without it, a numbered menu. It installs one IPA per
run, so run it once per build. The phone has to be plugged in or reachable with Wireless Debugging
on, or the device list comes up empty.

The dev client is only half an app until Metro is serving the JS:

```bash
npm run start:dev
```

The preview build is standalone and runs on its own.

## Getting it onto TestFlight

Needs a paid Apple Developer Program membership and an app record in App Store Connect whose
bundle ID matches `client/app.config.js`. Create the record first — `eas submit` can do it for you
on the first run, but only if the identifier is free.

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

`eas submit` prompts for the Apple ID, team, and App Store Connect app ID on the first run and
remembers them; put them in `eas.json` under `submit.production.ios` if you'd rather not be asked.

Processing on Apple's side takes a few minutes, after which the build appears under TestFlight.
Internal testers (up to 100, on your team) get it immediately. External testers need Apple's
review of the *build*, which is lighter than App Store review but not instant.

> `ITSAppUsesNonExemptEncryption` is set to `false` in `client/app.config.js`. The app only uses
> encryption for HTTPS, which is exempt, and declaring that up front is what stops every single
> build from landing in TestFlight as "Missing Compliance" waiting on a manual answer.

## Why the app can talk to an HTTP server

iOS App Transport Security blocks plain HTTP, and the common Yarukoto setup is exactly that — a
server on your LAN at `http://192.168.x.x:8080`. `client/app.config.js` sets two Info.plist keys to
allow it:

- `NSAllowsLocalNetworking` permits HTTP to private-range and `.local` addresses. It is the
  narrow exception; `NSAllowsArbitraryLoads` would allow HTTP *everywhere* and draws questions at
  App Store review.
- `NSLocalNetworkUsageDescription` is the string in the permission prompt. Since iOS 14, reaching
  any device on the local network needs the user's consent, and without this key the connection
  fails rather than prompting.

Neither helps a server exposed over the internet on plain HTTP — that still needs HTTPS, which
is what you should be doing anyway. See [TLS](/self-hosting/reverse-proxy/).

**Android has no equivalent today.** Since Android 9 a release build refuses cleartext unless the
manifest sets `usesCleartextTraffic`, and nothing in `app.config.js` does. Debug builds allow it
(the dev client's manifest turns it on), which is why the gap only shows in a release or store
build: those reach HTTPS servers only. Android's network security config can name domains but
not address ranges, so there is no way to allow just the local network the way
`NSAllowsLocalNetworking` does; allowing it at all means allowing it everywhere.
