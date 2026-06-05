//! LSP transport — spec 25.
//!
//! Spawns language server child processes, bridges their stdio to the webview
//! via Tauri events, and manages server lifetimes.

use serde::Serialize;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

// ---------------------------------------------------------------------------
// Payloads emitted to the webview
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LspMessagePayload {
    pub lsp_id: String,
    pub message: JsonValue,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LspExitPayload {
    pub lsp_id: String,
    pub code: Option<i32>,
}

// ---------------------------------------------------------------------------
// Per-process state
// ---------------------------------------------------------------------------

pub struct LspProcess {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Child>,
}

#[derive(Default)]
pub struct LspManager(pub Mutex<HashMap<String, Arc<LspProcess>>>);

// ---------------------------------------------------------------------------
// Content-Length framing helpers
// ---------------------------------------------------------------------------

/// Write one LSP framed message to `writer`.
fn write_message(writer: &mut impl Write, json: &JsonValue) -> std::io::Result<()> {
    let body = serde_json::to_vec(json).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    write!(writer, "Content-Length: {}\r\n\r\n", body.len())?;
    writer.write_all(&body)?;
    writer.flush()
}

/// Read one LSP framed message from a buffered reader.
fn read_message(reader: &mut impl BufRead) -> Option<JsonValue> {
    // Read headers until blank line.
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 {
            return None; // EOF
        }
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            break;
        }
        if let Some(rest) = line.strip_prefix("Content-Length: ") {
            content_length = rest.trim().parse().ok();
        }
    }
    let len = content_length?;
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf).ok()?;
    serde_json::from_slice(&buf).ok()
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Spawn a language server. Returns an opaque `lsp_id` that identifies the connection.
///
/// `server_cmd` — binary name or absolute path (e.g. `"typescript-language-server"`).
/// `args`       — command-line arguments (e.g. `["--stdio"]`).
/// `workspace`  — workspace root path; included in the `initialize` request.
#[tauri::command]
pub fn spawn_lsp(
    app: AppHandle,
    manager: State<'_, LspManager>,
    server_cmd: String,
    args: Vec<String>,
    workspace: String,
) -> Result<String, String> {
    let mut child = Command::new(&server_cmd)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null()) // stderr goes to /dev/null; can pipe to log later
        .current_dir(&workspace)
        .spawn()
        .map_err(|e| format!("Failed to spawn '{server_cmd}': {e}"))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout: ChildStdout = child.stdout.take().ok_or("no stdout")?;

    let lsp_id = uuid::Uuid::new_v4().to_string();
    let proc = Arc::new(LspProcess {
        stdin: Mutex::new(stdin),
        child: Mutex::new(child),
    });

    manager.0.lock().unwrap().insert(lsp_id.clone(), Arc::clone(&proc));

    // Background reader thread: parse Content-Length frames, emit lsp:message.
    let id_clone = lsp_id.clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_message(&mut reader) {
                Some(msg) => {
                    let _ = app_clone.emit(
                        "lsp:message",
                        LspMessagePayload { lsp_id: id_clone.clone(), message: msg },
                    );
                }
                None => {
                    // EOF — process exited; collect exit code.
                    let code = Arc::clone(&proc)
                        .child
                        .lock()
                        .ok()
                        .and_then(|mut c| c.try_wait().ok().flatten())
                        .and_then(|s| s.code());
                    let _ = app_clone.emit(
                        "lsp:exit",
                        LspExitPayload { lsp_id: id_clone.clone(), code },
                    );
                    break;
                }
            }
        }
    });

    Ok(lsp_id)
}

/// Send a JSON-RPC message to a running language server.
#[tauri::command]
pub fn lsp_send(
    manager: State<'_, LspManager>,
    lsp_id: String,
    message: JsonValue,
) -> Result<(), String> {
    let guard = manager.0.lock().unwrap();
    let proc = guard.get(&lsp_id).ok_or_else(|| format!("Unknown lsp_id: {lsp_id}"))?;
    let mut stdin = proc.stdin.lock().unwrap();
    write_message(&mut *stdin, &message)
        .map_err(|e| format!("Failed to write to LSP stdin: {e}"))
}

/// Stop a running language server.
#[tauri::command]
pub fn lsp_stop(
    manager: State<'_, LspManager>,
    lsp_id: String,
) -> Result<(), String> {
    let mut guard = manager.0.lock().unwrap();
    if let Some(proc) = guard.remove(&lsp_id) {
        let _ = proc.child.lock().unwrap().kill();
    }
    Ok(())
}

/// Stop all running language servers. Called on workspace close and app exit.
pub fn stop_all_lsp(manager: &LspManager) {
    let mut guard = manager.0.lock().unwrap();
    for (_, proc) in guard.drain() {
        let _ = proc.child.lock().unwrap().kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_roundtrip() {
        let msg = serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": "test" });
        let mut buf = Vec::new();
        write_message(&mut buf, &msg).unwrap();
        let text = String::from_utf8_lossy(&buf);
        assert!(text.starts_with("Content-Length: "), "expected header: {text}");

        let mut reader = std::io::BufReader::new(&buf[..]);
        let decoded = read_message(&mut reader).expect("should decode");
        assert_eq!(decoded, msg);
    }

    #[test]
    fn read_message_eof_returns_none() {
        let buf: &[u8] = &[];
        let mut reader = std::io::BufReader::new(buf);
        assert!(read_message(&mut reader).is_none());
    }

    #[test]
    fn read_message_invalid_json_returns_none() {
        let body = b"not json";
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        let mut data = header.into_bytes();
        data.extend_from_slice(body);
        let mut reader = std::io::BufReader::new(&data[..]);
        assert!(read_message(&mut reader).is_none());
    }
}
