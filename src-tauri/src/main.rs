#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod modules;

use modules::commands::{
    get_workspace_path, list_dir, open_settings_window, pick_workspace_folder, read_file, send_to_harness,
    start_harness, stop_harness, write_file,
};
use modules::pty::{pty_close, pty_create, pty_resize, pty_write};
use modules::pty::PtyManager;
use modules::sidecar::{SharedSidecar, SidecarManager};
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(SidecarManager::new()) as SharedSidecar)
        .manage(PtyManager::default())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_file,
            write_file,
            get_workspace_path,
            pick_workspace_folder,
            start_harness,
            send_to_harness,
            stop_harness,
            open_settings_window,
            pty_create,
            pty_write,
            pty_resize,
            pty_close,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(debug_assertions)]
            window.open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
