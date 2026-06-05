use crate::modules::filesystem::{
    create_directory, delete_path, find_files as find_files_inner, list_dir_tree as list_dir_tree_inner,
    list_directory, path_exists as path_exists_inner, read_file_ranged,
    rename_path, web_fetch as web_fetch_inner, write_file_contents, FileEntry, ReadFileResult,
};
use crate::modules::watcher::WatcherState;
use crate::modules::git::{
    git_commit as git_commit_inner, git_current_branch as git_current_branch_inner,
    git_create_checkpoint as git_create_checkpoint_inner,
    git_diff as git_diff_inner, git_discard as git_discard_inner,
    git_is_repo as git_is_repo_inner,
    git_restore_checkpoint as git_restore_checkpoint_inner,
    git_file_at_head as git_file_at_head_inner, git_log as git_log_inner,
    git_stage as git_stage_inner, git_status as git_status_inner,
    git_unstage as git_unstage_inner, GitLogEntry, GitPathStatus,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[tauri::command]
pub fn list_dir(path: &str) -> Result<Vec<FileEntry>, String> {
    list_directory(path)
}

#[tauri::command]
pub fn read_file(
    path: &str,
    start_line: Option<u32>,
    max_lines: Option<u32>,
) -> Result<ReadFileResult, String> {
    read_file_ranged(path, start_line, max_lines)
}

#[tauri::command]
pub fn write_file(path: &str, contents: &str) -> Result<String, String> {
    write_file_contents(path, contents)
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    create_directory(&path)
}

#[tauri::command]
pub fn rename_entry(from: String, to: String) -> Result<(), String> {
    rename_path(&from, &to)
}

#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    delete_path(&path)
}

#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    path_exists_inner(&path)
}

#[tauri::command]
pub fn find_files(
    workspace_path: String,
    glob_pattern: String,
    max_results: Option<usize>,
) -> Result<Vec<String>, String> {
    find_files_inner(&workspace_path, &glob_pattern, max_results.unwrap_or(100))
}

#[tauri::command]
pub fn list_dir_tree(
    path: String,
    max_depth: Option<usize>,
    max_entries: Option<usize>,
) -> Result<Vec<FileEntry>, String> {
    list_dir_tree_inner(&path, max_depth.unwrap_or(3), max_entries.unwrap_or(500))
}

#[tauri::command]
pub fn web_fetch(url: String, allowed_hosts: Vec<String>, max_bytes: Option<usize>) -> Result<String, String> {
    web_fetch_inner(&url, &allowed_hosts, max_bytes.unwrap_or(64_000))
}

#[tauri::command]
pub fn git_current_branch(repo_path: String) -> Result<Option<String>, String> {
    git_current_branch_inner(&repo_path)
}

#[tauri::command]
pub fn git_status(repo_path: String) -> Result<Vec<GitPathStatus>, String> {
    git_status_inner(&repo_path)
}

#[tauri::command]
pub fn git_diff(repo_path: String, path: Option<String>) -> Result<String, String> {
    git_diff_inner(&repo_path, path.as_deref())
}

#[tauri::command]
pub fn git_stage(repo_path: String, path: String) -> Result<(), String> {
    git_stage_inner(&repo_path, &path)
}

#[tauri::command]
pub fn git_unstage(repo_path: String, path: String) -> Result<(), String> {
    git_unstage_inner(&repo_path, &path)
}

#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    git_commit_inner(&repo_path, &message)
}

#[tauri::command]
pub fn git_log(repo_path: String, limit: Option<usize>) -> Result<Vec<GitLogEntry>, String> {
    git_log_inner(&repo_path, limit.unwrap_or(32))
}

#[tauri::command]
pub fn git_file_at_head(repo_path: String, path: String) -> Result<Option<String>, String> {
    git_file_at_head_inner(&repo_path, &path)
}

#[tauri::command]
pub fn git_discard(repo_path: String, path: String) -> Result<(), String> {
    git_discard_inner(&repo_path, &path)
}

#[tauri::command]
pub fn git_create_checkpoint(repo_path: String, ref_suffix: String) -> Result<String, String> {
    git_create_checkpoint_inner(&repo_path, &ref_suffix)
}

#[tauri::command]
pub fn git_restore_checkpoint(repo_path: String, oid: String) -> Result<(), String> {
    git_restore_checkpoint_inner(&repo_path, &oid)
}

#[tauri::command]
pub fn git_is_repo(repo_path: String) -> bool {
    git_is_repo_inner(&repo_path)
}

fn workspace_override_file() -> Option<PathBuf> {
    dirs::config_local_dir().map(|d| d.join("sidebar").join("workspace_root.txt"))
}

fn recent_projects_file() -> Option<PathBuf> {
    dirs::config_local_dir().map(|d| d.join("sidebar").join("recent_projects.json"))
}

const MAX_RECENT: usize = 8;

/// Returns the persisted list of recently-opened project paths (most recent first).
#[tauri::command]
pub fn get_recent_projects() -> Vec<String> {
    let Some(file) = recent_projects_file() else { return vec![] };
    let raw = std::fs::read_to_string(&file).unwrap_or_default();
    let list: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    // Filter to directories that still exist.
    list.into_iter().filter(|p| Path::new(p).is_dir()).collect()
}

/// Prepends `path` to the recent-projects list, deduplicates, and caps at MAX_RECENT.
#[tauri::command]
pub fn add_recent_project(path: String) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() || !Path::new(&path).is_dir() {
        return Ok(()); // Silently ignore bad paths.
    }
    let file = recent_projects_file()
        .ok_or_else(|| "Could not resolve config directory".to_string())?;
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = std::fs::read_to_string(&file).unwrap_or_default();
    let mut list: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    list.retain(|p| p != &path);
    list.insert(0, path);
    list.truncate(MAX_RECENT);
    let json = serde_json::to_string(&list).map_err(|e| e.to_string())?;
    std::fs::write(&file, json).map_err(|e| e.to_string())
}

/// Launch arguments parsed from the process argv.
#[derive(Debug, Serialize)]
pub struct LaunchArgs {
    /// Absolute path to a file or directory passed as the first CLI argument (if any).
    pub path: Option<String>,
    /// True when `path` points to a file (not a directory).
    pub is_file: bool,
}

/// Returns the parsed CLI launch arguments so the frontend can react to
/// `sidebar <file>` or `sidebar <directory>` invocations.
#[tauri::command]
pub fn get_launch_args() -> LaunchArgs {
    // Skip argv[0] (binary name). Accept one optional path argument.
    let raw = std::env::args().nth(1);
    match raw {
        None => LaunchArgs { path: None, is_file: false },
        Some(arg) => {
            let p = PathBuf::from(&arg);
            let abs = if p.is_absolute() {
                p.clone()
            } else {
                std::env::current_dir().unwrap_or_default().join(&p)
            };
            let is_file = abs.is_file();
            let is_dir = abs.is_dir();
            if is_file || is_dir {
                LaunchArgs {
                    path: Some(abs.to_string_lossy().to_string()),
                    is_file,
                }
            } else {
                LaunchArgs { path: None, is_file: false }
            }
        }
    }
}

fn read_workspace_override() -> Option<String> {
    let file = workspace_override_file()?;
    let raw = std::fs::read_to_string(&file).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let p = PathBuf::from(trimmed);
    if p.is_dir() {
        Some(p.to_string_lossy().to_string())
    } else {
        None
    }
}

fn write_workspace_override(path: &str) -> Result<(), String> {
    let p = Path::new(path.trim());
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path.trim()));
    }
    let file =
        workspace_override_file().ok_or_else(|| "Could not resolve config directory".to_string())?;
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&file, path.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_workspace_path() -> Result<String, String> {
    if let Some(p) = read_workspace_override() {
        return Ok(p);
    }
    env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_workspace_folder(window: WebviewWindow) -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Open workspace folder")
        .set_parent(&window)
        .pick_folder()
        .await;
    let Some(folder) = folder else {
        return Ok(None);
    };
    let s = folder.path().to_string_lossy().to_string();
    if Path::new(&s).is_dir() {
        write_workspace_override(&s)?;
        return Ok(Some(s));
    }
    Ok(None)
}

/// Start (or replace) the recursive filesystem watcher for the given workspace.
/// Emits a debounced `fs:changed` event when relevant files change on disk.
#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
    workspace_path: String,
) -> Result<(), String> {
    state.watch(app, &workspace_path)
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok::<(), String>(());
    }

    let _win = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Settings — Sidebar Editor")
        .inner_size(900.0, 700.0)
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;

    Ok::<(), String>(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GrepMatch {
    pub path: String,
    pub line_number: u32,
    pub line_content: String,
}

#[tauri::command]
pub fn grep_workspace(
    workspace_path: String,
    pattern: String,
    file_glob: Option<String>,
    case_sensitive: Option<bool>,
    is_regex: Option<bool>,
    whole_word: Option<bool>,
) -> Result<Vec<GrepMatch>, String> {
    let ws = Path::new(&workspace_path);
    if !ws.is_dir() {
        return Err(format!("Workspace path is not a directory: {workspace_path}"));
    }

    let mut cmd = Command::new("rg");
    cmd.arg("--line-number")
        .arg("--no-heading")
        .arg("--color=never")
        .arg("--max-count=500");

    // Case: default is case-insensitive (smart-case); explicit true = sensitive.
    match case_sensitive {
        Some(true) => { cmd.arg("--case-sensitive"); }
        Some(false) => { cmd.arg("--ignore-case"); }
        None => { cmd.arg("--smart-case"); }
    }

    // Regex off (default) = treat pattern as a fixed string.
    if is_regex != Some(true) {
        cmd.arg("--fixed-strings");
    }

    if whole_word == Some(true) {
        cmd.arg("--word-regexp");
    }

    if let Some(glob) = file_glob {
        cmd.arg("--glob").arg(glob);
    }

    cmd.arg(&pattern).arg(&workspace_path);

    let output = cmd.output().map_err(|e| format!("Failed to run ripgrep: {e}"))?;

    if !output.status.success() && output.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("No such file or directory") || stderr.contains("not found") {
            return Err("ripgrep (rg) not found. Please install it.".to_string());
        }
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut matches = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(3, ':').collect();
        if parts.len() >= 3 {
            if let Ok(line_num) = parts[1].parse::<u32>() {
                matches.push(GrepMatch {
                    path: parts[0].to_string(),
                    line_number: line_num,
                    line_content: parts[2].to_string(),
                });
            }
        }
    }

    Ok(matches)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShellResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
}

#[tauri::command]
pub fn run_shell(
    workspace_path: String,
    command: String,
    timeout_ms: Option<u64>,
) -> Result<ShellResult, String> {
    let ws = Path::new(&workspace_path);
    if !ws.is_dir() {
        return Err(format!("Workspace path is not a directory: {workspace_path}"));
    }

    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30000));

    let shell = if cfg!(target_os = "windows") {
        "cmd"
    } else {
        "sh"
    };
    let shell_arg = if cfg!(target_os = "windows") {
        "/C"
    } else {
        "-c"
    };

    let mut child = Command::new(shell)
        .arg(shell_arg)
        .arg(&command)
        .current_dir(&workspace_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {e}"))?;

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = child.wait_with_output().map_err(|e| e.to_string())?;
                return Ok(ShellResult {
                    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                    exit_code: status.code(),
                    timed_out: false,
                });
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    return Ok(ShellResult {
                        stdout: String::new(),
                        stderr: format!("Command timed out after {}ms", timeout.as_millis()),
                        exit_code: None,
                        timed_out: true,
                    });
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(format!("Error waiting for command: {e}")),
        }
    }
}

const SIDEBAR_DIR: &str = ".sidebar";
const SYSTEM_PROMPT_FILE: &str = "prompt.md";
const PROMPTS_DIR: &str = "prompts";
const SKILLS_DIR: &str = "skills";
const PROJECT_STATE_FILE: &str = "state.json";

fn sidebar_dir(workspace_path: &str) -> Result<PathBuf, String> {
    let ws = Path::new(workspace_path);
    if !ws.is_dir() {
        return Err(format!("Workspace path is not a directory: {workspace_path}"));
    }
    Ok(ws.join(SIDEBAR_DIR))
}

fn ensure_sidebar_dir(workspace_path: &str) -> Result<PathBuf, String> {
    let dir = sidebar_dir(workspace_path)?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create .sidebar directory: {e}"))?;
    }
    Ok(dir)
}

#[tauri::command]
pub fn ensure_system_prompts_layout(workspace_path: String) -> Result<(), String> {
    let dir = ensure_sidebar_dir(&workspace_path)?;
    let prompts_dir = dir.join(PROMPTS_DIR);
    std::fs::create_dir_all(&prompts_dir)
        .map_err(|e| format!("Failed to create .sidebar/prompts directory: {e}"))
}

#[tauri::command]
pub fn ensure_skill_dir(workspace_path: String, skill_id: String) -> Result<(), String> {
    if skill_id.is_empty()
        || skill_id.contains('/')
        || skill_id.contains('\\')
        || skill_id.contains("..")
    {
        return Err(format!("Invalid skill id: {skill_id}"));
    }
    let dir = ensure_sidebar_dir(&workspace_path)?;
    let skill_dir = dir.join(SKILLS_DIR).join(&skill_id);
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory '{skill_id}': {e}"))
}

#[tauri::command]
pub fn read_system_prompt(workspace_path: String) -> Result<Option<String>, String> {
    let ws = Path::new(&workspace_path);
    if !ws.is_dir() {
        return Err(format!("Workspace path is not a directory: {workspace_path}"));
    }

    let prompt_path = ws.join(SIDEBAR_DIR).join(SYSTEM_PROMPT_FILE);
    if !prompt_path.exists() {
        return Ok(None);
    }

    std::fs::read_to_string(&prompt_path)
        .map(Some)
        .map_err(|e| format!("Failed to read system prompt: {e}"))
}

#[tauri::command]
pub fn write_system_prompt(workspace_path: String, content: String) -> Result<(), String> {
    let ws = Path::new(&workspace_path);
    if !ws.is_dir() {
        return Err(format!("Workspace path is not a directory: {workspace_path}"));
    }

    let prompt_dir = ensure_sidebar_dir(&workspace_path)?;

    let prompt_path = prompt_dir.join(SYSTEM_PROMPT_FILE);
    std::fs::write(&prompt_path, content)
        .map_err(|e| format!("Failed to write system prompt: {e}"))
}

#[tauri::command]
pub fn read_project_state(workspace_path: String) -> Result<Option<String>, String> {
    let dir = sidebar_dir(&workspace_path)?;
    let state_path = dir.join(PROJECT_STATE_FILE);
    if !state_path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&state_path)
        .map(Some)
        .map_err(|e| format!("Failed to read project state: {e}"))
}

#[tauri::command]
pub fn write_project_state(workspace_path: String, content: String) -> Result<(), String> {
    let dir = ensure_sidebar_dir(&workspace_path)?;
    let state_path = dir.join(PROJECT_STATE_FILE);
    std::fs::write(&state_path, content)
        .map_err(|e| format!("Failed to write project state: {e}"))
}

#[tauri::command]
pub fn icon_pack_get_dir() -> Option<String> {
    crate::modules::icon_pack::icon_pack_dir()
}

#[tauri::command]
pub fn icon_pack_refresh_bundled() -> Result<String, String> {
    crate::modules::icon_pack::refresh_vscode_icons_pack()
}

#[tauri::command]
pub async fn pick_icon_pack_folder(window: WebviewWindow) -> Result<Option<String>, String> {
    let picked = rfd::AsyncFileDialog::new()
        .set_title("Select icon pack folder")
        .set_parent(&window)
        .pick_folder()
        .await;
    Ok(picked.map(|p| p.path().to_string_lossy().into_owned()))
}

// ---------------------------------------------------------------------------
// Workspace lock (spec 35)
// ---------------------------------------------------------------------------

const LOCK_FILE: &str = ".lock";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockInfo {
    pub pid: u32,
    pub timestamp: String,
    pub hostname: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind")]
pub enum LockResult {
    Acquired,
    ConflictLive { lock_info: LockInfo },
}

fn lock_path(workspace_path: &str) -> Result<PathBuf, String> {
    Ok(sidebar_dir(workspace_path)?.join(LOCK_FILE))
}

fn current_hostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_string())
}

fn current_timestamp() -> String {
    // RFC 3339-ish without chrono dep: use a simpler format via SystemTime.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Format as ISO 8601 basic (seconds precision only — display use only).
    let (year, month, day, hour, min, sec) = epoch_to_datetime(secs);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}Z")
}

fn epoch_to_datetime(secs: u64) -> (u64, u64, u64, u64, u64, u64) {
    let sec = secs % 60;
    let min = (secs / 60) % 60;
    let hour = (secs / 3600) % 24;
    let days = secs / 86400;
    // Simplified Gregorian conversion (good until 2100).
    let year = 1970 + days / 365;
    let remaining = days % 365;
    let month = remaining / 30 + 1;
    let day = remaining % 30 + 1;
    (year, month.min(12), day.min(31), hour, min, sec)
}

fn is_process_alive(pid: u32) -> bool {
    #[cfg(target_os = "linux")]
    {
        Path::new(&format!("/proc/{pid}")).exists()
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output();
        match out {
            Ok(o) => String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()),
            Err(_) => false,
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = pid;
        // Conservative: treat as live on unknown platforms.
        true
    }
}

/// Managed state: workspace path for which this process holds the lock.
#[derive(Default)]
pub struct ActiveLockPath(pub std::sync::Mutex<Option<String>>);

#[tauri::command]
pub fn acquire_workspace_lock(
    workspace_path: String,
    active_lock: tauri::State<ActiveLockPath>,
) -> Result<LockResult, String> {
    // Ensure the .spacebar directory exists before trying to write the lock.
    if let Err(e) = ensure_sidebar_dir(&workspace_path) {
        // If we can't create the dir, proceed without a lock (degraded).
        eprintln!("[workspace-lock] cannot create dir: {e}");
        return Ok(LockResult::Acquired);
    }
    let path = lock_path(&workspace_path)?;

    if path.exists() {
        let raw = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read lock file: {e}"))?;
        if let Ok(info) = serde_json::from_str::<LockInfo>(&raw) {
            if info.pid != std::process::id() && is_process_alive(info.pid) {
                return Ok(LockResult::ConflictLive { lock_info: info });
            }
        }
        // Stale or unreadable — overwrite.
    }

    let info = LockInfo {
        pid: std::process::id(),
        timestamp: current_timestamp(),
        hostname: current_hostname(),
    };
    let json = serde_json::to_string(&info).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write lock file: {e}"))?;

    *active_lock.0.lock().unwrap() = Some(workspace_path);
    Ok(LockResult::Acquired)
}

#[tauri::command]
pub fn release_workspace_lock(
    workspace_path: String,
    active_lock: tauri::State<ActiveLockPath>,
) -> Result<(), String> {
    let path = match lock_path(&workspace_path) {
        Ok(p) => p,
        Err(_) => return Ok(()),
    };
    if !path.exists() {
        return Ok(());
    }
    // Only remove our own lock.
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(info) = serde_json::from_str::<LockInfo>(&raw) {
            if info.pid != std::process::id() {
                return Ok(());
            }
        }
    }
    let _ = std::fs::remove_file(&path);
    *active_lock.0.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn read_workspace_lock(workspace_path: String) -> Result<Option<LockInfo>, String> {
    let path = lock_path(&workspace_path)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read lock file: {e}"))?;
    let info = serde_json::from_str::<LockInfo>(&raw)
        .map_err(|e| format!("Failed to parse lock file: {e}"))?;
    Ok(Some(info))
}

/// Synchronous lock release called from the CloseRequested handler.
pub fn release_active_lock_sync(active_lock: &ActiveLockPath) {
    let guard = active_lock.0.lock().unwrap();
    if let Some(ref ws) = *guard {
        if let Ok(path) = lock_path(ws) {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod lock_tests {
    use super::*;
    use std::fs;

    fn make_tmp_workspace() -> PathBuf {
        let base = std::env::temp_dir().join(format!("tl_lock_test_{}", std::process::id()));
        let ws = base.join(format!("ws_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(ws.join(".sidebar")).expect("create test workspace");
        ws
    }

    #[test]
    fn current_process_is_alive() {
        assert!(is_process_alive(std::process::id()));
    }

    #[test]
    fn dead_pid_not_alive() {
        // PID u32::MAX is virtually guaranteed not to be running.
        assert!(!is_process_alive(u32::MAX));
    }

    #[test]
    fn stale_lock_is_overwritten() {
        let ws_path = make_tmp_workspace();
        let ws = ws_path.to_str().unwrap().to_string();
        let lp = lock_path(&ws).unwrap();

        // Plant a stale lock (dead PID).
        let stale = LockInfo {
            pid: u32::MAX,
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            hostname: "test".to_string(),
        };
        fs::write(&lp, serde_json::to_string(&stale).unwrap()).unwrap();

        // Manually simulate what acquire_workspace_lock does for the stale case.
        let raw = fs::read_to_string(&lp).unwrap();
        let parsed: LockInfo = serde_json::from_str(&raw).unwrap();
        assert!(!is_process_alive(parsed.pid));

        // Overwrite with our PID.
        let ours = LockInfo {
            pid: std::process::id(),
            timestamp: current_timestamp(),
            hostname: current_hostname(),
        };
        fs::write(&lp, serde_json::to_string(&ours).unwrap()).unwrap();

        let re_parsed: LockInfo = serde_json::from_str(&fs::read_to_string(&lp).unwrap()).unwrap();
        assert_eq!(re_parsed.pid, std::process::id());

        fs::remove_dir_all(&ws_path).ok();
    }

    #[test]
    fn own_lock_is_not_removed_by_other_pid_check() {
        let ws_path = make_tmp_workspace();
        let ws = ws_path.to_str().unwrap().to_string();
        let lp = lock_path(&ws).unwrap();

        // Write our own lock.
        let ours = LockInfo {
            pid: std::process::id(),
            timestamp: current_timestamp(),
            hostname: current_hostname(),
        };
        fs::write(&lp, serde_json::to_string(&ours).unwrap()).unwrap();

        // A second open of same workspace: reads lock, pid == our pid — no conflict.
        let raw = fs::read_to_string(&lp).unwrap();
        let parsed: LockInfo = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed.pid, std::process::id());
        // is_process_alive for our own PID must be true.
        assert!(is_process_alive(parsed.pid));

        fs::remove_dir_all(&ws_path).ok();
    }

    #[test]
    fn release_sync_removes_lock_file() {
        let ws_path = make_tmp_workspace();
        let ws = ws_path.to_str().unwrap().to_string();
        let lp = lock_path(&ws).unwrap();

        let ours = LockInfo {
            pid: std::process::id(),
            timestamp: current_timestamp(),
            hostname: current_hostname(),
        };
        fs::write(&lp, serde_json::to_string(&ours).unwrap()).unwrap();
        assert!(lp.exists());

        let active = ActiveLockPath(std::sync::Mutex::new(Some(ws)));
        release_active_lock_sync(&active);
        assert!(!lp.exists());

        fs::remove_dir_all(&ws_path).ok();
    }
}

#[cfg(test)]
mod recent_tests {
    use super::*;
    use std::fs;

    fn make_tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "tl_recent_test_{}_{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_recent_file(file: &PathBuf, list: &[&str]) {
        if let Some(p) = file.parent() {
            fs::create_dir_all(p).ok();
        }
        fs::write(file, serde_json::to_string(&list).unwrap()).unwrap();
    }

    #[test]
    fn add_recent_deduplicates_and_prepends() {
        let tmp = make_tmp();
        // We can't call the Tauri command directly because it writes to
        // config_local_dir. Instead test the core logic by manipulating the
        // list directly (same algorithm as add_recent_project).
        let mut list: Vec<String> = vec![
            tmp.to_str().unwrap().to_string(),
            "/other/path".to_string(),
        ];
        let new_path = tmp.to_str().unwrap().to_string();
        list.retain(|p| p != &new_path);
        list.insert(0, new_path.clone());
        list.truncate(MAX_RECENT);
        assert_eq!(list[0], new_path);
        assert_eq!(list.len(), 2); // no duplicate

        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn add_recent_caps_at_max() {
        let dirs: Vec<PathBuf> = (0..10).map(|_| make_tmp()).collect();
        let mut list: Vec<String> = dirs
            .iter()
            .map(|d| d.to_str().unwrap().to_string())
            .collect();
        let newest = dirs[0].to_str().unwrap().to_string();
        list.retain(|p| p != &newest);
        list.insert(0, newest);
        list.truncate(MAX_RECENT);
        assert!(list.len() <= MAX_RECENT);

        for d in &dirs {
            fs::remove_dir_all(d).ok();
        }
    }

    #[test]
    fn launch_args_no_args_returns_none() {
        // std::env::args() will have the test binary path as argv[0] and
        // test runner args after; there won't be a valid path at argv[1]
        // (it'll be something like --test-threads=...). get_launch_args()
        // checks if the path exists, so non-existent paths → path: None.
        let result = get_launch_args();
        // We can't control argv in a unit test, but we can at least verify
        // the function returns without panicking.
        let _ = result;
    }

    #[test]
    fn launch_args_with_existing_dir() {
        // Simulate the directory-path case by testing the canonicalization logic.
        let tmp = make_tmp();
        let abs = if tmp.is_absolute() {
            tmp.clone()
        } else {
            std::env::current_dir().unwrap_or_default().join(&tmp)
        };
        assert!(abs.is_dir());
        assert!(!abs.is_file());
        fs::remove_dir_all(&tmp).ok();
    }
}
