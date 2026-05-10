//! PTY sessions for integrated terminal (spec §6).

use portable_pty::{Child, CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct PtyManager(pub Mutex<HashMap<String, Arc<PtySession>>>);

pub struct PtySession {
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

#[tauri::command]
pub fn pty_create(app: AppHandle, manager: State<'_, PtyManager>, cwd: Option<String>) -> Result<String, String> {
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

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    if let Some(ref dir) = cwd {
        cmd.cwd(dir.as_str());
    } else if let Ok(ws) = std::env::current_dir() {
        cmd.cwd(ws.as_os_str());
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app2.emit(
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
        let _ = app2.emit(
            "pty:exit",
            PtyExitPayload {
                id: id2,
                code: None,
            },
        );
    });

    let session = Arc::new(PtySession {
        writer: Mutex::new(writer),
        child: Mutex::new(Some(child)),
    });

    manager.0.lock().map_err(|e| e.to_string())?.insert(id.clone(), session);
    Ok(id)
}

#[tauri::command]
pub fn pty_write(manager: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    let map = manager.0.lock().map_err(|e| e.to_string())?;
    let session = map.get(&id).ok_or_else(|| "Unknown PTY session".to_string())?;
    let mut w = session.writer.lock().map_err(|e| e.to_string())?;
    w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(_manager: State<'_, PtyManager>, _id: String, _cols: u16, _rows: u16) -> Result<(), String> {
    // Resize requires holding `MasterPty` alongside `take_writer`; revisit with a dedicated IO thread.
    Ok(())
}

#[tauri::command]
pub fn pty_close(manager: State<'_, PtyManager>, id: String) -> Result<(), String> {
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
