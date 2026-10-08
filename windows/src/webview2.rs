//! WebView2 settings Tauri doesn't expose.
//!
//! By default WebView2 answers the keys a browser does: F5 and Ctrl+R reload
//! the page out from under the user, Ctrl+P prints it, Ctrl+F opens a find bar
//! over it, Ctrl+plus zooms it. In an app those are all wrong, and Ctrl+F in
//! particular belongs to the app's own find command. Turning the browser's
//! accelerator keys off leaves editing keys (copy, paste, undo) working and
//! hands everything else to the page.
//!
//! The status bar is the URL that WebView2 pops up in the bottom corner while
//! the pointer is over a link: a browser tell, so it goes too.

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Settings, ICoreWebView2Settings3};
use windows::core::Interface;

pub fn make_app_like<R: tauri::Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let Ok(settings) = core.Settings() else {
            return;
        };
        apply(&settings);
    });
}

unsafe fn apply(settings: &ICoreWebView2Settings) {
    let _ = settings.SetIsStatusBarEnabled(false);
    let _ = settings.SetIsZoomControlEnabled(false);
    if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
        let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
    }
}
