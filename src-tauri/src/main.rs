#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod modules;

use modules::commands::{
    acquire_workspace_lock, add_recent_project, create_dir, delete_entry, find_files, get_launch_args, get_platform_info,
    get_recent_projects, get_workspace_path, git_commit, git_current_branch, git_diff,
    git_create_checkpoint, git_discard, git_file_at_head, git_is_repo, git_log,
    git_restore_checkpoint, git_stage, git_status, git_unstage, grep_workspace, list_dir,
    list_dir_tree, icon_pack_get_dir, icon_pack_refresh_bundled, open_editor_window, open_settings_window,
    path_exists, pick_icon_pack_folder, pick_workspace_folder, read_app_settings, read_file, read_onboarding_complete,
    read_project_state, read_system_prompt, read_workspace_lock, release_active_lock_sync, release_workspace_lock,
    write_app_settings, write_onboarding_complete,
    rename_entry, run_shell, watch_workspace, web_fetch, write_file, write_project_state,
    write_system_prompt, ensure_system_prompts_layout, ensure_skill_dir,
};
use modules::lsp::{spawn_lsp, lsp_send, lsp_stop, stop_all_lsp};
use modules::pty::{pty_close, pty_create, pty_resize, pty_write};
use modules::window_state::{LockRegistry, LspRegistry, PtyRegistry, WatcherRegistry};
use tauri::Manager;

/// Registers per-window state for `window` and installs a close handler that
/// tears it down — releases the workspace lock, stops LSP servers, kills PTY
/// sessions, and drops the file watcher, all scoped to this window only.
/// Called once for the initial "main" window in `.setup()`, and again for
/// every window opened via `open_editor_window` (independent Dock windows).
pub fn install_window_close_handler(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let label = window.label().to_string();
    // Warm the registries so entries exist even if the window closes before
    // any PTY/LSP/watch/lock command ever ran.
    app.state::<PtyRegistry>().get_or_init(&label);
    app.state::<LspRegistry>().get_or_init(&label);
    app.state::<WatcherRegistry>().get_or_init(&label);
    app.state::<LockRegistry>().get_or_init(&label);

    let handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if let Some(lock) = handle.state::<LockRegistry>().remove(&label) {
                release_active_lock_sync(&lock);
            }
            if let Some(lsp) = handle.state::<LspRegistry>().remove(&label) {
                stop_all_lsp(&lsp);
            }
            if let Some(pty) = handle.state::<PtyRegistry>().remove(&label) {
                pty.close_all();
            }
            handle.state::<WatcherRegistry>().remove(&label);
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(PtyRegistry::default())
        .manage(WatcherRegistry::default())
        .manage(LockRegistry::default())
        .manage(LspRegistry::default())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_file,
            write_file,
            create_dir,
            rename_entry,
            delete_entry,
            path_exists,
            find_files,
            list_dir_tree,
            web_fetch,
            get_workspace_path,
            pick_workspace_folder,
            open_settings_window,
            open_editor_window,
            git_current_branch,
            git_status,
            git_diff,
            git_stage,
            git_unstage,
            git_commit,
            git_log,
            git_file_at_head,
            git_discard,
            git_create_checkpoint,
            git_restore_checkpoint,
            git_is_repo,
            pty_create,
            pty_write,
            pty_resize,
            pty_close,
            grep_workspace,
            watch_workspace,
            run_shell,
            read_system_prompt,
            write_system_prompt,
            ensure_system_prompts_layout,
            ensure_skill_dir,
            read_project_state,
            write_project_state,
            icon_pack_get_dir,
            icon_pack_refresh_bundled,
            pick_icon_pack_folder,
            acquire_workspace_lock,
            release_workspace_lock,
            read_workspace_lock,
            get_recent_projects,
            add_recent_project,
            read_app_settings,
            write_app_settings,
            read_onboarding_complete,
            write_onboarding_complete,
            get_launch_args,
            get_platform_info,
            spawn_lsp,
            lsp_send,
            lsp_stop,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(debug_assertions)]
            window.open_devtools();

            install_window_close_handler(&app.handle().clone(), &window);

            // macOS Dock right-click "New Window" — see modules::macos_dock
            // for why this needs raw Cocoa interop rather than a Tauri API.
            #[cfg(target_os = "macos")]
            {
                if let Some(mtm) = objc2_foundation::MainThreadMarker::new() {
                    let app_handle = app.handle().clone();
                    modules::macos_dock::install(mtm, move || {
                        let _ = modules::commands::open_editor_window(app_handle.clone());
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
