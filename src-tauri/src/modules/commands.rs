use crate::modules::filesystem::{list_directory, read_file_contents, write_file_contents, FileEntry};
use crate::modules::sidecar::SharedSidecar;
use std::env;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

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
    let file = workspace_override_file().ok_or_else(|| "Could not resolve config directory".to_string())?;
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

/// Native folder picker; persists choice for future launches and returns the path, or `None` if cancelled.
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
pub fn start_harness(app_handle: AppHandle, sidecar: State<'_, SharedSidecar>) -> Result<(), String> {
    let mut manager = sidecar.lock().map_err(|e| e.to_string())?;
    let sidecar_path = get_sidecar_path()?;
    manager.start(&sidecar_path, app_handle)
}

#[tauri::command]
pub fn send_to_harness(
    method: &str,
    params: serde_json::Value,
    sidecar: State<'_, SharedSidecar>,
) -> Result<u64, String> {
    let mut manager = sidecar.lock().map_err(|e| e.to_string())?;
    manager.send(method, params)
}

#[tauri::command]
pub fn stop_harness(sidecar: State<'_, SharedSidecar>) -> Result<(), String> {
    let mut manager = sidecar.lock().map_err(|e| e.to_string())?;
    manager.stop();
    Ok(())
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
        .build()
        .map_err(|e| e.to_string())?;

    Ok::<(), String>(())
}

fn get_sidecar_path() -> Result<String, String> {
    let cwd = env::current_dir().map_err(|e| e.to_string())?;
    let sidecar_path = cwd.join("sidecar").join("dist").join("index.js");

    if sidecar_path.exists() {
        return Ok(sidecar_path.to_string_lossy().to_string());
    }

    let parent_path = cwd
        .parent()
        .map(|p| p.join("sidecar").join("dist").join("index.js"))
        .unwrap_or_default();

    if parent_path.exists() {
        return Ok(parent_path.to_string_lossy().to_string());
    }

    Err("Sidecar not found. Run 'npm run build' in the sidecar directory.".to_string())
}
