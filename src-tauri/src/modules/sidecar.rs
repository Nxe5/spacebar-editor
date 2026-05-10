use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize, Deserialize)]
pub struct RpcRequest {
    pub id: u64,
    pub method: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RpcEvent {
    pub id: u64,
    pub event: String,
    pub data: serde_json::Value,
}

pub struct SidecarProcess {
    child: Child,
    stdin: std::process::ChildStdin,
}

impl SidecarProcess {
    pub fn spawn(sidecar_path: &str) -> Result<Self, String> {
        let mut child = Command::new("node")
            .arg(sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to get stdin")?;

        Ok(Self { child, stdin })
    }

    pub fn send(&mut self, method: &str, params: serde_json::Value) -> Result<u64, String> {
        let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
        let request = RpcRequest {
            id,
            method: method.to_string(),
            params,
        };

        let json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        writeln!(self.stdin, "{}", json).map_err(|e| e.to_string())?;
        self.stdin.flush().map_err(|e| e.to_string())?;

        Ok(id)
    }

    pub fn take_stdout(&mut self) -> Option<std::process::ChildStdout> {
        self.child.stdout.take()
    }
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

pub struct SidecarManager {
    process: Option<SidecarProcess>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self { process: None }
    }

    pub fn start(&mut self, sidecar_path: &str, app_handle: AppHandle) -> Result<(), String> {
        if self.process.is_some() {
            return Ok(());
        }

        let mut process = SidecarProcess::spawn(sidecar_path)?;

        if let Some(stdout) = process.take_stdout() {
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        if let Ok(event) = serde_json::from_str::<RpcEvent>(&line) {
                            let _ = app_handle.emit("harness:event", event);
                        }
                    }
                }
            });
        }

        self.process = Some(process);
        Ok(())
    }

    pub fn send(&mut self, method: &str, params: serde_json::Value) -> Result<u64, String> {
        let process = self.process.as_mut().ok_or("Sidecar not started")?;
        process.send(method, params)
    }

    pub fn stop(&mut self) {
        self.process = None;
    }
}

pub type SharedSidecar = Mutex<SidecarManager>;
