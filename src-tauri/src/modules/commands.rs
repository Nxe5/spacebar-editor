use crate::modules::filesystem::{
    delete_path, find_files as find_files_inner, list_dir_tree as list_dir_tree_inner,
    list_directory, path_exists as path_exists_inner, read_file_contents, rename_path,
    web_fetch as web_fetch_inner, write_file_contents, FileEntry,
};
use crate::modules::git::{
    git_commit as git_commit_inner, git_current_branch as git_current_branch_inner,
    git_diff as git_diff_inner, git_discard as git_discard_inner,
    git_file_at_head as git_file_at_head_inner, git_log as git_log_inner,
    git_stage as git_stage_inner, git_status as git_status_inner,
    git_unstage as git_unstage_inner, GitLogEntry, GitPathStatus,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn list_dir(path: &str) -> Result<Vec<FileEntry>, String> {
    list_directory(path)
}

#[tauri::command]
pub fn read_file(path: &str) -> Result<String, String> {
    read_file_contents(path)
}

#[tauri::command]
pub fn write_file(path: &str, contents: &str) -> Result<(), String> {
    write_file_contents(path, contents)
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

fn workspace_override_file() -> Option<PathBuf> {
    dirs::config_local_dir().map(|d| d.join("tiny-llama").join("workspace_root.txt"))
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
pub fn pick_workspace_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Open workspace folder")
        .pick_folder();
    let Some(folder) = folder else {
        return Ok(None);
    };
    let s = folder.to_string_lossy().to_string();
    if Path::new(&s).is_dir() {
        write_workspace_override(&s)?;
        return Ok(Some(s));
    }
    Ok(None)
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok::<(), String>(());
    }

    let _win = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Settings — Tiny Llama")
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

const TINYLLAMA_DIR: &str = ".tinyllama";
const SYSTEM_PROMPT_FILE: &str = "prompt.md";
const PROJECT_STATE_FILE: &str = "state.json";

fn tinyllama_dir(workspace_path: &str) -> Result<PathBuf, String> {
    let ws = Path::new(workspace_path);
    if !ws.is_dir() {
        return Err(format!("Workspace path is not a directory: {workspace_path}"));
    }
    Ok(ws.join(TINYLLAMA_DIR))
}

fn ensure_tinyllama_dir(workspace_path: &str) -> Result<PathBuf, String> {
    let dir = tinyllama_dir(workspace_path)?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create .tinyllama directory: {e}"))?;
    }
    Ok(dir)
}

#[tauri::command]
pub fn read_system_prompt(workspace_path: String) -> Result<Option<String>, String> {
    let ws = Path::new(&workspace_path);
    if !ws.is_dir() {
        return Err(format!("Workspace path is not a directory: {workspace_path}"));
    }

    let prompt_path = ws.join(TINYLLAMA_DIR).join(SYSTEM_PROMPT_FILE);
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

    let prompt_dir = ensure_tinyllama_dir(&workspace_path)?;

    let prompt_path = prompt_dir.join(SYSTEM_PROMPT_FILE);
    std::fs::write(&prompt_path, content)
        .map_err(|e| format!("Failed to write system prompt: {e}"))
}

#[tauri::command]
pub fn read_project_state(workspace_path: String) -> Result<Option<String>, String> {
    let dir = tinyllama_dir(&workspace_path)?;
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
    let dir = ensure_tinyllama_dir(&workspace_path)?;
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
pub fn pick_icon_pack_folder() -> Result<Option<String>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Select icon pack folder")
        .pick_folder();
    Ok(picked.map(|p| p.to_string_lossy().into_owned()))
}
