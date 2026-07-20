//! PTY sessions for integrated terminal (spec §6).

use crate::modules::window_state::PtyRegistry;
use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State, Window};

#[derive(Default)]
pub struct PtyManager(pub Mutex<HashMap<String, Arc<PtySession>>>);

impl PtyManager {
    /// Kills every session tracked by this window's manager. Called when the
    /// owning window closes.
    pub fn close_all(&self) {
        let mut map = match self.0.lock() {
            Ok(m) => m,
            Err(_) => return,
        };
        for (_, session) in map.drain() {
            if let Ok(mut child_slot) = session.child.lock() {
                if let Some(mut child) = child_slot.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }
}

pub struct PtySession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Option<Box<dyn Child + Send + Sync>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PtyDataPayload {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PtyExitPayload {
    id: String,
    code: Option<i32>,
}

fn shell_command() -> CommandBuilder {
    let shell = default_shell();
    let mut cmd = CommandBuilder::new(&shell);

    // Spawn as a login shell on Unix so profile files (.zprofile, .bash_profile)
    // run and the user gets their real prompt + PATH. GUI apps launched from
    // Finder/Dock otherwise inherit a minimal environment with no prompt setup.
    #[cfg(unix)]
    {
        let name = std::path::Path::new(&shell)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if matches!(name, "zsh" | "bash" | "fish") {
            cmd.arg("-l");
        }
    }

    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd
}

fn default_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.trim().is_empty() {
            return shell;
        }
    }
    // Packaged GUI apps may lack $SHELL; fall back to the platform default.
    if cfg!(target_os = "macos") {
        "/bin/zsh".to_string()
    } else if cfg!(windows) {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        "/bin/sh".to_string()
    }
}

#[tauri::command]
pub fn pty_create(
    app: AppHandle,
    window: Window,
    registry: State<'_, PtyRegistry>,
    cwd: Option<String>,
) -> Result<String, String> {
    let manager = registry.get_or_init(window.label());
    let id = uuid::Uuid::new_v4().to_string();
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = shell_command();
    if let Some(ref dir) = cwd {
        cmd.cwd(dir.as_str());
    } else if let Ok(ws) = std::env::current_dir() {
        cmd.cwd(ws.as_os_str());
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let master = pair.master;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    let app2 = app.clone();
    let id2 = id.clone();
    let label2 = window.label().to_string();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app2.emit_to(
                        &label2,
                        "pty:data",
                        PtyDataPayload {
                            id: id2.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app2.emit_to(
            &label2,
            "pty:exit",
            PtyExitPayload {
                id: id2,
                code: None,
            },
        );
    });

    let session = Arc::new(PtySession {
        master: Mutex::new(master),
        writer: Mutex::new(writer),
        child: Mutex::new(Some(child)),
    });

    manager.0.lock().map_err(|e| e.to_string())?.insert(id.clone(), session);
    Ok(id)
}

#[tauri::command]
pub fn pty_write(window: Window, registry: State<'_, PtyRegistry>, id: String, data: String) -> Result<(), String> {
    let manager = registry.get_or_init(window.label());
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let session = map.get(&id).ok_or_else(|| "Unknown PTY session".to_string())?;
    let mut w = session.writer.lock().map_err(|e| e.to_string())?;
    w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    window: Window,
    registry: State<'_, PtyRegistry>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if cols == 0 || rows == 0 {
        return Ok(());
    }
    let manager = registry.get_or_init(window.label());
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let session = map.get(&id).ok_or_else(|| "Unknown PTY session".to_string())?;
    let master = session.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_close(window: Window, registry: State<'_, PtyRegistry>, id: String) -> Result<(), String> {
    let manager = registry.get_or_init(window.label());
    let mut map = manager.0.lock().map_err(|e| e.to_string())?;
    if let Some(session) = map.remove(&id) {
        if let Ok(mut child_slot) = session.child.lock() {
            if let Some(mut child) = child_slot.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    Ok(())
}
