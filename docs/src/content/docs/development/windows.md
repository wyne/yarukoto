---
title: Building the Windows app
description: The Tauri shell around the web build, and what it does differently from a browser tab.
---

The Windows app is the web build in a native window. `windows/` is a small
[Tauri](https://tauri.app) project that bundles the client's web export and shows it in
WebView2, the Edge engine Windows 10 and 11 already ship. There is no Windows-specific UI: the
desktop layout, keyboard shortcuts and right-click menus are the ones the web build already has,
because `DESKTOP_UI` is on for every web build.

React Native for Windows was the alternative. It was ruled out because Expo doesn't support Windows,
Reanimated and Gesture Handler have no Windows code, and it trails React Native by a couple of
versions, so the app would have had to be ported rather than built.

## Building

You need Node, Rust (`rustup`), and on Windows the Visual Studio C++ build tools that Rust's
installer offers.

```bash
cd client && npm ci        # the web export comes from here
cd ../windows && npm ci    # the Tauri CLI
npm run build              # exports the web client, then builds the installers
npm run dev                # starts Expo's web dev server and opens it in the shell
```

`npm run build` leaves an `.exe` (NSIS, installs for the current user, no admin prompt) and an
`.msi` under `windows/target/release/bundle/`. The installer fetches WebView2 if the PC somehow
lacks it.

CI does the same on `windows-latest` (`.github/workflows/windows.yml`) for every pull request that
touches `windows/`, and on demand from **Actions → Windows app → Run workflow**. The installers are
attached to the run. They are unsigned, so SmartScreen warns on first launch: **More info → Run
anyway**.

## What the shell changes

Everything else is the page, unchanged. The shell only stops it from behaving like a browser tab:

| Change | Where | Why |
|---|---|---|
| One instance | `tauri-plugin-single-instance` | A second launch focuses the open window instead of starting another copy against the same local storage. |
| Window size and position remembered | `tauri-plugin-window-state` | Every desktop app does this. |
| Links open in the default browser | `on_new_window` / `on_navigation` in `main.rs` | A link in a note would otherwise open a bare WebView2 window, or navigate the app away. |
| Browser keys off | `webview2.rs` | F5 and Ctrl+R reload the app, Ctrl+P prints it, Ctrl+F opens WebView2's find bar over the app's own find. Editing keys keep working. |
| No link-URL popup | `webview2.rs` | WebView2's status bar shows the URL under the pointer, a browser tell. |
| Browser right-click menu only in text | `init.js` | Back, Refresh and Inspect are meaningless here; Cut, Copy and Paste in a field are not. |
| OS file drop off | `dragDropEnabled: false` | With it on, WebView2 swallows the page's own drag events. |

## Connecting to a server

The page is served from `http://tauri.localhost`, which isn't a Yarukoto server, so the first-run
screen asks for one as it does on the phone. Being plain HTTP is deliberate: a self-hosted server on
the local network is usually plain HTTP too, and an HTTPS page couldn't reach it (the same mixed
content problem that limits [the web demo](/development/web-demo/)). The server already accepts
cross-origin requests from any origin.

## Not done yet

- **Reminders.** Notifications are off in every web build, so the Windows app has none either.
  Bringing them back means scheduling Windows toasts from the shell.
- **A menu bar.** Windows apps often go without one, and every command is in the command menu
  (Ctrl+K). If it's wanted, it would be built from `client/src/navigation/commands.ts` the way the
  Mac's is.
- **Signing and updates.** The build is unsigned and doesn't update itself.
