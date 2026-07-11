#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod modules;

use modules::commands::{
    acquire_workspace_lock, add_recent_project, create_dir, delete_entry, find_files, get_launch_args,
    get_recent_projects, get_workspace_path, git_commit, git_current_branch, git_diff,
    git_create_checkpoint, git_discard, git_file_at_head, git_is_repo, git_log,
    git_restore_checkpoint, git_stage, git_status, git_unstage, grep_workspace, list_dir,
    list_dir_tree, icon_pack_get_dir, icon_pack_refresh_bundled, open_settings_window, path_exists,
    pick_icon_pack_folder, pick_workspace_folder, read_file, read_project_state, read_system_prompt,
    read_workspace_lock, release_active_lock_sync, release_workspace_lock, rename_entry, run_shell,
    watch_workspace, web_fetch, write_file, write_project_state, write_system_prompt,
    ensure_system_prompts_layout, ensure_skill_dir, ActiveLockPath,
};
use modules::lsp::{spawn_lsp, lsp_send, lsp_stop, stop_all_lsp, LspManager};
use modules::pty::{pty_close, pty_create, pty_resize, pty_write, PtyManager};
use modules::watcher::WatcherState;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(PtyManager::default())
        .manage(WatcherState::default())
        .manage(ActiveLockPath::default())
        .manage(LspManager::default())
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
            get_launch_args,
            spawn_lsp,
            lsp_send,
            lsp_stop,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(debug_assertions)]
            window.open_devtools();

            // Best-effort lock release on window close.
            let handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    release_active_lock_sync(&handle.state::<ActiveLockPath>());
                    stop_all_lsp(&handle.state::<LspManager>());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
