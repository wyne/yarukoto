//! The Windows app: the client's web export in a WebView2 window.
//!
//! Everything the app does happens in that page, exactly as it does in a
//! browser tab, talking to the user's server over fetch. This file only makes
//! the window behave like an app rather than a browser: one instance, its size
//! and place remembered, links opened in the user's browser instead of inside
//! the window, WebView2's browser chrome (see webview2.rs) turned off, and an
//! icon in the notification area that keeps it running closed (see tray.rs).

// Without this a release build opens a console window alongside the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tray;
#[cfg(windows)]
mod webview2;

use tauri::webview::NewWindowResponse;
use tauri::{Manager, Url, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

/// The page the app itself is served from. Anything else is the web.
///
/// In a release build that is Tauri's asset origin (`http://tauri.localhost`
/// on Windows); in `tauri dev` it is the Expo dev server.
fn is_app_url(url: &Url) -> bool {
    match url.host_str() {
        Some("tauri.localhost") => true,
        Some("localhost") => cfg!(debug_assertions),
        _ => url.scheme() == "tauri",
    }
}

/// Hands a link to the user's default browser.
///
/// Notes can hold links, and react-native-web's `Linking.openURL` is a
/// `window.open`. Left alone, that would open a bare second WebView2 window
/// with no address bar, which is neither the app nor a browser.
fn open_outside<R: tauri::Runtime>(app: &tauri::AppHandle<R>, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

fn main() {
    tauri::Builder::default()
        // Must be registered first, so a second launch hands over and exits
        // before anything else starts up. Launching it again while it sits in
        // the notification area brings the window back, as clicking the icon does.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app)
        }))
        // Not whether the window was showing: it is hidden whenever the app is
        // exited from the notification area, and the next launch should still
        // open one. Whether a launch shows the window is decided in setup.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![tray::HIDDEN_ARG]),
        ))
        .invoke_handler(tauri::generate_handler![
            tray::tray_settings,
            tray::set_show_in_tray,
            tray::set_open_at_login,
            tray::set_tray_tasks,
            tray::set_taskbar_badge,
        ])
        // The close button hides the window into the notification area while
        // the icon is up; Exit in the icon's menu is what quits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && tray::keeps_running(window.app_handle()) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            tray::install(app.handle())?;
            // A login launch starts in the notification area, unless the icon
            // is off and there would be nothing on screen to open it from.
            let hidden = std::env::args().any(|arg| arg == tray::HIDDEN_ARG)
                && tray::keeps_running(app.handle());

            // The window is declared in tauri.conf.json with `create: false`
            // and built here, because the navigation handlers can only be
            // attached to a builder.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .expect("tauri.conf.json declares the main window")
                .clone();

            let on_new = app.handle().clone();
            let on_nav = app.handle().clone();
            let window = WebviewWindowBuilder::from_config(app, &config)?
                .visible(!hidden)
                .on_new_window(move |url, _features| {
                    open_outside(&on_new, &url);
                    NewWindowResponse::Deny
                })
                .on_navigation(move |url| {
                    if is_app_url(url) {
                        return true;
                    }
                    open_outside(&on_nav, url);
                    false
                })
                .initialization_script(include_str!("init.js"))
                .build()?;

            #[cfg(windows)]
            webview2::make_app_like(&window);
            #[cfg(not(windows))]
            let _ = window;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Yarukoto");
}
