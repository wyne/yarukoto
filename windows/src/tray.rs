//! The notification area icon, and with it keeping Yarukoto running with the
//! window closed. The Windows counterpart of the Mac's menu bar extra.
//!
//! Done the way Windows apps do it rather than copied from the Mac: a left
//! click on the icon opens the window and a right click opens the menu, the
//! count is in the icon's tooltip and on the taskbar button (tray icons carry
//! no badge), and the menu ends in Exit rather than Quit.
//!
//! The page sends the Overdue and Today sections with `set_tray_tasks`, built from the same
//! `statusMenuContents` the Mac's menu is, and gets the menu's choices back as
//! `tray-action` events. Everything here is native state rather than a synced
//! preference, because it has to be known before the page loads: whether a
//! login launch starts with no window, and whether the close button hides.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_autostart::ManagerExt;

const TRAY_ID: &str = "main";

/// Passed by the login item, so a login launch starts in the notification area.
pub const HIDDEN_ARG: &str = "--hidden";

/// Longer titles are cut in the menu, which is as wide as its widest item.
const TITLE_LIMIT: usize = 60;

#[derive(Clone, Deserialize)]
pub struct TrayTask {
    id: String,
    title: String,
}

/// Overdue or Today. `total` is everything in it, for its header; past the
/// tasks listed, `more`.
#[derive(Clone, Deserialize)]
pub struct TraySection {
    overdue: bool,
    total: u32,
    tasks: Vec<TrayTask>,
    more: u32,
}

/// What the page last sent. None until it has, and again once it leaves the
/// account, so a signed-out app lists nothing from it. The page's `count`
/// goes to the taskbar badge rather than here.
#[derive(Clone, Deserialize)]
pub struct TrayContents {
    sections: Vec<TraySection>,
}

#[derive(Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct Prefs {
    show_in_tray: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self { show_in_tray: true }
    }
}

#[derive(Default)]
pub struct Tray {
    prefs: Mutex<Prefs>,
    contents: Mutex<Option<TrayContents>>,
}

/// One of the menu's choices, for the page to answer. Open and Exit are
/// answered here.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrayAction {
    action: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    task_id: Option<String>,
}

fn prefs_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("tray.json"))
}

fn load_prefs<R: Runtime>(app: &AppHandle<R>) -> Prefs {
    prefs_path(app)
        .and_then(|path| std::fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save_prefs<R: Runtime>(app: &AppHandle<R>, prefs: &Prefs) -> Result<(), String> {
    let path = prefs_path(app).ok_or("no settings folder")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec(prefs).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// Whether the icon is up, and so whether closing the window hides it.
pub fn keeps_running<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.state::<Tray>().prefs.lock().unwrap().show_in_tray
}

/// Reads the settings and puts the icon up. Called from setup, before the
/// window exists, so the window can be built hidden for a login launch.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let tray = Tray::default();
    *tray.prefs.lock().unwrap() = load_prefs(app);
    let visible = tray.prefs.lock().unwrap().show_in_tray;
    app.manage(tray);

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Yarukoto")
        .menu(&build_menu(app, None)?)
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let icon = builder.build(app)?;
    icon.set_visible(visible)?;
    Ok(())
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Windows reads `&` in a menu item as the next letter's access key, and a tab
/// as the start of its shortcut.
fn menu_text(title: &str) -> String {
    let flat = title.replace(['\t', '\n', '\r'], " ");
    let cut = if flat.chars().count() > TITLE_LIMIT {
        let mut short: String = flat.chars().take(TITLE_LIMIT - 1).collect();
        short.push('…');
        short
    } else {
        flat
    };
    cut.replace('&', "&&")
}

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    contents: Option<&TrayContents>,
) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    if let Some(contents) = contents {
        // Choosing a task opens it; marking one done is a step further in,
        // under Mark done, so a stray click never checks a task off.
        let done = Submenu::new(app, "Mark done", true)?;
        let mut listed = false;
        for section in &contents.sections {
            let name = if section.overdue { "Overdue" } else { "Today" };
            // The header carries the section's total, so the badge's number can
            // always be found in the menu: one header, or both added together.
            let heading = if section.total > 0 {
                format!("{name} · {}", section.total)
            } else {
                name.to_owned()
            };
            menu.append(&MenuItem::new(app, heading, false, None::<&str>)?)?;
            if section.total == 0 {
                menu.append(&MenuItem::new(app, "Nothing due", false, None::<&str>)?)?;
            }
            for task in &section.tasks {
                let title = menu_text(&task.title);
                menu.append(&MenuItem::with_id(
                    app,
                    format!("task:{}", task.id),
                    title.clone(),
                    true,
                    None::<&str>,
                )?)?;
                // A checkbox, so the row reads as "tick to mark done".
                done.append(&CheckMenuItem::with_id(
                    app,
                    format!("done:{}", task.id),
                    title,
                    true,
                    false,
                    None::<&str>,
                )?)?;
                listed = true;
            }
            if section.more > 0 {
                // Both open Today, which lists overdue tasks too.
                let text = if section.overdue {
                    format!("{} more overdue…", section.more)
                } else {
                    format!("{} more in Today…", section.more)
                };
                menu.append(&MenuItem::with_id(
                    app,
                    format!(
                        "today:{}",
                        if section.overdue { "overdue" } else { "today" }
                    ),
                    text,
                    true,
                    None::<&str>,
                )?)?;
            }
        }
        if listed {
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            menu.append(&done)?;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append(&MenuItem::with_id(
        app,
        "newTask",
        "New task…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "open",
        "Open Yarukoto",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "settings",
        "Settings…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?)?;
    Ok(menu)
}

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    let action = match id {
        "open" => return show_main(app),
        "exit" => return app.exit(0),
        "newTask" | "settings" | "today:overdue" | "today:today" => {
            show_main(app);
            TrayAction {
                action: match id {
                    "newTask" => "newTask",
                    "settings" => "settings",
                    _ => "today",
                },
                task_id: None,
            }
        }
        _ => {
            if let Some(task_id) = id.strip_prefix("task:") {
                show_main(app);
                TrayAction {
                    action: "openTask",
                    task_id: Some(task_id.to_owned()),
                }
            } else if let Some(task_id) = id.strip_prefix("done:") {
                TrayAction {
                    action: "complete",
                    task_id: Some(task_id.to_owned()),
                }
            } else {
                return;
            }
        }
    };
    let _ = app.emit_to("main", "tray-action", action);
}

fn refresh<R: Runtime>(app: &AppHandle<R>, tray: &TrayIcon<R>) -> tauri::Result<()> {
    let contents = app.state::<Tray>().contents.lock().unwrap().clone();
    tray.set_menu(Some(build_menu(app, contents.as_ref())?))?;
    // The tooltip says what both sections hold, whatever the badge counts.
    let parts: Vec<String> = contents
        .iter()
        .flat_map(|c| &c.sections)
        .filter(|s| s.total > 0)
        .map(|s| {
            if s.overdue {
                format!("{} overdue", s.total)
            } else {
                format!("{} due today", s.total)
            }
        })
        .collect();
    let tooltip = if parts.is_empty() {
        "Yarukoto".to_owned()
    } else {
        format!("Yarukoto · {}", parts.join(", "))
    };
    tray.set_tooltip(Some(tooltip))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraySettings {
    show_in_tray: bool,
    /// None where the login item can't be read.
    open_at_login: Option<bool>,
}

#[tauri::command]
pub fn tray_settings<R: Runtime>(app: AppHandle<R>, tray: State<'_, Tray>) -> TraySettings {
    TraySettings {
        show_in_tray: tray.prefs.lock().unwrap().show_in_tray,
        open_at_login: app.autolaunch().is_enabled().ok(),
    }
}

#[tauri::command]
pub fn set_show_in_tray<R: Runtime>(
    app: AppHandle<R>,
    tray: State<'_, Tray>,
    enabled: bool,
) -> Result<(), String> {
    let mut prefs = tray.prefs.lock().unwrap();
    prefs.show_in_tray = enabled;
    save_prefs(&app, &prefs)?;
    if let Some(icon) = app.tray_by_id(TRAY_ID) {
        icon.set_visible(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Adds or removes the login item (the user's Run key, listed in Task Manager
/// under Startup apps), and answers where that left it.
#[tauri::command]
pub fn set_open_at_login<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    result.map_err(|e| e.to_string())?;
    launcher.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tray_tasks<R: Runtime>(
    app: AppHandle<R>,
    tray: State<'_, Tray>,
    contents: Option<TrayContents>,
) -> Result<(), String> {
    *tray.contents.lock().unwrap() = contents;
    if let Some(icon) = app.tray_by_id(TRAY_ID) {
        refresh(&app, &icon).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The count on the taskbar button, as Windows draws a badge: a small image
/// over the corner of the app's icon. The page draws it, since it has the
/// fonts; `rgba` is `size`×`size` pixels, and none clears it.
#[tauri::command]
pub fn set_taskbar_badge<R: Runtime>(
    app: AppHandle<R>,
    rgba: Option<Vec<u8>>,
    size: u32,
) -> Result<(), String> {
    let icon = match rgba {
        Some(pixels) if pixels.len() == (size * size * 4) as usize => {
            Some(Image::new_owned(pixels, size, size))
        }
        Some(_) => return Err("badge is not size × size RGBA".into()),
        None => None,
    };
    #[cfg(windows)]
    if let Some(window) = app.get_webview_window("main") {
        window.set_overlay_icon(icon).map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    let _ = (app, icon);
    Ok(())
}
