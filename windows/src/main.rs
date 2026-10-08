//! The Windows app: the client's web export in a WebView2 window.
//!
//! Everything the app does happens in that page, exactly as it does in a
//! browser tab, talking to the user's server over fetch. This file only makes
//! the window behave like an app rather than a browser: one instance, its size
//! and place remembered, links opened in the user's browser instead of inside
//! the window, and WebView2's browser chrome (see webview2.rs) turned off.

// Without this a release build opens a console window alongside the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
mod webview2;

use tauri::webview::NewWindowResponse;
use tauri::{Manager, Url, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

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
        // before anything else starts up.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
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
