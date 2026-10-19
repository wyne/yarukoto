fn main() {
    // The page's only way into the shell: these commands, granted to the main
    // window in capabilities/default.json. Listing them makes Tauri refuse any
    // command a capability doesn't grant.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "tray_settings",
            "set_show_in_tray",
            "set_open_at_login",
            "set_tray_tasks",
            "set_taskbar_badge",
        ]),
    ))
    .expect("failed to run tauri-build");
}
