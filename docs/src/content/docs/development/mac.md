---
title: Building the Mac app
description: Mac Catalyst builds, signed releases and desktop input.
---

Expo has no macOS target, but it doesn't need one: the iOS project builds for **Mac Catalyst**,
which compiles the same app into a real macOS `.app` (arm64 and x86_64) with resizable windows and
a menu bar. The wide layout — pinned sidebar, list, and task pane side by side — is the same
`width >= 900` check the web build uses, so a Mac window gets it with no Mac-specific screens.

```bash
cd client
npm run mac              # prebuild with Catalyst on, then a Release build for the Mac
npm run mac -- --open    # ...and launch it
npm run mac:release      # sign, notarize, staple, and package a website download
npm run mac:dev          # the dev client, built Debug and launched against Metro
npm run mac:dev -- --no-build   # relaunch the last dev build; enough for JS changes
```

The development command prints the path to the finished app under `client/ios/build/catalyst/`.
`APP_VARIANT` works as
it does for the phone (`APP_VARIANT=preview npm run mac`), so variants can sit side by side on a
Mac too.

`mac:dev` is the Mac's `ios:dev` plus `start:dev` in one: it builds the development variant in
Debug, starts Metro in the terminal, and opens the app pointed at it, so JS edits reload in place.
Only a native change needs the rebuild; for anything else, `--no-build` starts in seconds.

Like `ios:dev`, this **regenerates `client/ios`** with `prebuild --clean`, and what it leaves there
is a Catalyst-enabled project. The next phone build that prebuilds replaces it; one that doesn't
(`expo run:ios` on its own) would compile it as-is, which works but is slower — see below.

## What makes it build

`client/plugins/mac-catalyst` applies four changes to the generated project. Each one was a build
failure without it:

| Change | Why |
|---|---|
| React Native's `:mac_catalyst_enabled` Podfile flag, plus `SUPPORTS_MACCATALYST` on the app target | Offers the Mac destination at all, and applies React Native's Catalyst linker and signing fixes. |
| `EXPO_USE_PRECOMPILED_MODULES=false` | Expo's precompiled module xcframeworks have no Catalyst slice, so those modules compile from source instead. React Native's own prebuilt core and Hermes *do* have one and stay prebuilt. |
| Every pod's `MACOSX_DEPLOYMENT_TARGET` → 14.0 | CocoaPods defaults pods to macOS 10.15, below the oldest macOS Xcode will build for. |
| Every pod's `IPHONEOS_DEPLOYMENT_TARGET` → 16.4 | Catalyst derives a pod's macOS target from its iOS one, and React Native's pods default to 15.1, which maps too low. The app already requires 16.4, so this changes nothing on a phone. |

**It is opt-in** — the plugin only runs when `MAC_CATALYST=1`, which `npm run mac` sets. Compiling
Expo's modules from source makes every build slower, and React Native's Catalyst patch rewrites
the app target's library search paths; a phone build shouldn't carry either for a target it isn't
producing. The plugin's Podfile edits anchor on text in Expo's template and fail the prebuild if
it changes, rather than quietly generating a project that won't build for the Mac.

EAS Build has no Catalyst target, so Mac builds are local-only.

## Signed direct-download releases

`npm run mac:release` creates a Developer ID-signed archive and disk image, submits the DMG to
Apple's notary service, staples the accepted ticket, verifies it with Gatekeeper, and writes a DMG plus SHA-256
checksum under `client/dist/macos/<version>-<build>/`. It reads the signing identity from the
login keychain and the notarization credential from the `yarukoto-notary` keychain profile; neither
secret lives in the repository.

The disk image opens to a window with the app, a link to Applications and a background with an
arrow between them, so installing is one drag. [dmgbuild](https://github.com/dmgbuild/dmgbuild)
writes that window's layout (`client/scripts/dmg-settings.py`) without driving Finder, which is
what lets CI build it too; the script installs it into a virtualenv under `dist/` on first use. The
background is rendered from `client/assets/dmg/background.html`, at 1x and 2x.

The version defaults to the root `package.json`, the same source Release Please and Expo use. The
build number defaults to a UTC timestamp so
successive local releases increase naturally. Either can be made explicit:

```bash
cd client
MAC_VERSION=1.0.1 MAC_BUILD_NUMBER=2026092701 npm run mac:release
```

Set `APPLE_TEAM_ID` or `NOTARY_PROFILE` only when using a different Apple team or keychain profile.
To notarize with an App Store Connect API key instead of a keychain profile, set `NOTARY_KEY` (the
`.p8` file's path), `NOTARY_KEY_ID` and `NOTARY_ISSUER`.

### Publishing the download

Merging Release Please's `chore: release X.Y.Z` PR runs
`.github/workflows/desktop-release.yml`: it builds the Windows installers alongside the signed Mac
app and attaches them to the [Yarukoto release](https://github.com/wyne/yarukoto/releases). You can
also run **Actions → Desktop release → Run workflow** to rebuild a version. The version defaults to
the root `package.json`; running a version again replaces its files.

During the `v1.0.0` cutover, the website and [Getting the apps](/using/apps/) keep using the
existing downloads in the legacy desktop repository:

- `https://github.com/wyne/yarukoto-desktop/releases/latest/download/Yarukoto-mac.dmg`
- `https://github.com/wyne/yarukoto-desktop/releases/latest/download/Yarukoto-windows-setup.exe`
- `https://github.com/wyne/yarukoto-desktop/releases/latest/download/Yarukoto-windows.msi`

Those stable public links remain on the legacy desktop repository through the `v1.0.0` cutover.
After this repository has a complete app release, switch the website and docs to its matching
`releases/latest/download/` URLs.

The workflow needs these repository secrets:

| Secret | What it is |
|---|---|
| `MAC_CERTIFICATE_P12` | The Developer ID Application certificate with its private key, exported from Keychain Access as a `.p12` and base64-encoded (`base64 -i cert.p12 \| pbcopy`). |
| `MAC_CERTIFICATE_PASSWORD` | The password chosen for that export. |
| `APPLE_API_KEY_P8` | The text of an App Store Connect API key (`.p8`) from **Users and Access → Integrations → App Store Connect API**. Developer access is enough to notarize. |
| `APPLE_API_KEY_ID` | That key's ID. |
| `APPLE_API_ISSUER_ID` | The issuer ID shown above the key list. |

The release workflow additionally needs `EXPO_TOKEN` for the iOS and Android EAS builds. An
optional fine-grained `RELEASE_PLEASE_TOKEN` with repository contents and pull request write access
lets Release Please's generated PR trigger normal CI; without it, the PR is still created but its
checks need to be run or verified separately.

The release prebuild also enables App Sandbox, outgoing network connections, and the hardened runtime
for Catalyst. The existing `NSLocalNetworkUsageDescription` and `NSAllowsLocalNetworking` entries
remain responsible for the user-facing LAN prompt and LAN HTTP exception.

## Desktop input on the Mac

On the Mac `Platform.OS` is `'ios'`, so nothing keyed on the platform alone can tell it from a
phone. `src/data/platform.ts` instead answers the questions the UI actually asks:

- **`DESKTOP_UI`** — a keyboard and pointer are assumed present: the pinned add field instead of
  the floating button, click-to-select, popovers instead of sheets, resizable panes. Every web
  build and the Mac.
- **`FINE_POINTER`** — a mouse or trackpad: drags start immediately instead of after a hold, and
  menus come from right-click instead of long-press.
- **`FLOATING_TAB_BAR`** — the narrow layout's tab bar is native chrome over the content, which
  content has to clear. Every native build, the Mac included.

Width decides layout separately, as it always has.

**Native menus** — the task pane's Date, Time and Reminders, among others — are SwiftUI menus from
`@expo/ui`. On the Mac SwiftUI draws a menu's trigger as a system pop-up button, which can't show a
custom label, so they rendered as empty pills. `src/components/NativeMenu.tsx` restyles the trigger
as a plain button on the Mac so our own value-and-chevron label shows, while the menu that opens
stays the system's. Use it in place of `@expo/ui/community/menu`.

**Light and dark.** Native controls — menus, date pickers, glass — take their appearance from the
window, which follows the device, while the app has a light/dark setting of its own. On iOS the
theme provider overrides the window's appearance to match the app's setting, so a dark app on a
light Mac or phone gets dark menus instead of light ones.

**No wheels.** iOS's wheel pickers aren't supported on the Mac: UIKit throws the moment one appears,
and the app crashes. The compact time field that stands in for one draws but takes no input when
hosted in the app. So the Mac picks a time from three menus — hour, minute in five-minute steps,
AM/PM (`src/components/pickers/MacTimeMenus.tsx`) — and a reminder's offset from a menu, where a
phone spins wheels.

**Right-click** goes through `ContextMenuTarget`, which opens the same popover menus on web and the
Mac. On web it listens for the DOM `contextmenu` event. On iOS, React Native's gesture recognizers
only accept the primary button, so a right-click never reaches JS on its own. The local Expo module
`client/modules/mac-pointer` wraps the target in a native view carrying a
`UIContextMenuInteraction` — the channel Mac Catalyst routes right-clicks through. It reports the
click's position to JS and declines to show a native menu, so the JS popover opens instead. (A
gesture recognizer requiring the secondary button looks like the obvious tool and doesn't work:
UIKit never offers it the click.)

The interaction is only installed on the Mac. On a touchscreen it would answer a long press, which
already starts a drag, so an iPad with a trackpad has no right-click yet.

**Hover** tints rows, menu items and buttons as on web. React Native on iOS dispatches no pointer
events at all unless a global switch is on, and it is off by default — so the same module turns it
on, Mac only, from a `+load` hook that runs before React Native starts (`MacPointerEvents.m`).
`src/components/HoverPressable.tsx` then turns pointer enter and leave into the `hovered` flag
react-native-web already supplies, so the hover styles in `src/theme/hover.ts` work unchanged. Use it
in place of React Native's `Pressable` anywhere that styles on `hovered`. The list's drag handle,
which only appears on hover, takes pointer enter and leave directly — and matters more than a tint:
with a fine pointer, rows drag from that handle alone. Tooltips still listen for DOM events and
stay web-only.

**The menu bar** adds the app's own commands to the one Catalyst provides, from one list in
`src/navigation/commands.ts`:

| Menu | Command | Key |
|---|---|---|
| Yarukoto | Settings… | ⌘, |
| File | New Task — the pinned add field, or the Inbox's on a screen without one | ⌘N |
| Edit | Find… — Browse's search | ⌘F |
| View | Command Menu… | ⌘K |
| Task | Open Task | ⌘O, or ↩ in the list |
| Task | Mark as Done | ⌘↩ |
| Task | Due Today / Due Tomorrow / Remove Due Date | ⌘T / ⌥⌘T / — |
| Task | Priority ▸ High, Medium, Low, None | ⌥⌘1, 2, 3, 0 |
| Task | Move to Trash | ⌫ in the list |
| Help | Yarukoto Help / Contact Support / Privacy Policy — open the docs, the support page and the privacy policy in the browser | — |

The Task menu works on the list's cursor: the row last clicked or arrowed to, which keeps its tint.
With a selection it works on all of it. Format is removed, since nothing here styles text, and
Help's own items replace the system's, which has no help book to open. A
command nothing on screen can answer is dimmed, and a Task command also while a popover or dialog
is up.

**The list's own keys** — ↑ and ↓ to move the cursor, ⇧↑ and ⇧↓ to select, ↩ to open, ⌫ to trash,
Escape to deselect — are not in the menu bar, and can't be: AppKit tries a menu key equivalent before
anything focused hears the key, so a plain ↩ there would take Return from every text field.
Instead the list holds them itself, through `KeyCommandsView` in `client/modules/mac-pointer`,
taking the keyboard when it appears, when you click in it, and when a dialog closes. A field
focused anywhere else keeps every key.

The **command menu** (⌘K) searches every view, list, folder, tag and saved filter, and every
command something on screen can answer, with each one's key beside it — so it doubles as the way
to learn them. The web build has it too, along with the Task keys a browser lets a page have (not
⌘N or ⌘T, which open a window and a tab first).

Catalyst asks the app delegate to amend the menu, which no module can do, so `plugins/mac-catalyst`
writes a small override into the generated AppDelegate that hands the menu to
`client/modules/mac-menu`. JS sends it the command list once it starts, and screens answer
commands through `useCommand` in `src/navigation/MenuCommands.tsx`. Undo doesn't get a command of
its own: completing or trashing a task registers on the window's undo manager, so the system's
Edit ▸ Undo reads "Undo Complete Task" or "Undo Move to Trash" and ⌘Z undoes it for as long as the undo toast is up, while a focused
text field keeps ⌘Z for its typing.

## Where it stands

The app launches, syncs with a real server, and renders its wide layout. Known gaps:

- **Development builds are unsigned.** `npm run mac` stays fast and local. Use
  `npm run mac:release` for a Developer ID-signed and notarized website download.
- **A server on your LAN needs Local Network permission** — including a public-looking hostname
  that split DNS resolves to a private address. macOS drops the connection until Yarukoto is on in
  System Settings → Privacy & Security → Local Network, and the app shows "Could not reach the
  server". **Quit and relaunch the app after granting it** — the running process keeps failing
  until then. macOS ties that permission to the code signature, which an unsigned build changes on
  every rebuild, so the prompt may not appear or may not stick; signing with a stable identity fixes
  that. Until then, the app's binary can be added to that list by hand.
- **Shift-click and Escape in lists** are web-only for now: both listen on `document`, which the
  Mac doesn't have. ⇧↑ and ⇧↓ select a range from the keyboard instead, and Escape does close
  popovers and dialogs.
- **The Pick time sheet is mostly empty** on the Mac: three small menus, in a sheet sized for the
  phone's wheel.
- **Untested on the Mac:** notifications, and their Mark done / Snooze actions.

## The other route: the iPhone app on Apple Silicon

Separately from Catalyst, Apple Silicon Macs can run the **unmodified iPhone build** from the Mac
App Store — an availability setting on the app record in App Store Connect, not a separate build.
It runs in a phone-sized window (the app is iPhone-only; see [Building the iOS app](/development/ios-and-android/))
and only on Apple Silicon, but costs nothing. Catalyst is the path to a Mac app that looks and
resizes like one.
