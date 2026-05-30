use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Debounce window: collapse bursts of FS events into a single emit.
const DEBOUNCE_MS: u64 = 250;

/// Directory names that never warrant a UI refresh (vendored/build noise).
const IGNORED_SEGMENTS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".svelte-kit",
    ".turbo",
    "coverage",
    ".venv",
    "__pycache__",
];

fn is_ignored(path: &Path) -> bool {
    path.components().any(|c| {
        c.as_os_str()
            .to_str()
            .map(|s| IGNORED_SEGMENTS.contains(&s))
            .unwrap_or(false)
    })
}

/// Owns a single active workspace watcher. Replacing the watch path drops the
/// previous watcher (its thread observes the closed channel and exits).
#[derive(Default)]
pub struct WatcherState {
    inner: Mutex<Option<RecommendedWatcher>>,
}

impl WatcherState {
    pub fn watch(&self, app_handle: AppHandle, watch_path: &str) -> Result<(), String> {
        let path = Path::new(watch_path);
        if !path.is_dir() {
            return Err(format!("Watch path is not a directory: {watch_path}"));
        }

        let (tx, rx) = channel();
        let mut watcher =
            RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string())?;
        watcher
            .watch(path, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;

        std::thread::spawn(move || run_debounced_loop(app_handle, rx));

        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        *guard = Some(watcher);
        Ok(())
    }
}

/// Collapses event bursts: emit `fs:changed` at most once per DEBOUNCE_MS while
/// relevant (non-ignored) events keep arriving.
fn run_debounced_loop(app_handle: AppHandle, rx: std::sync::mpsc::Receiver<notify::Result<notify::Event>>) {
    let mut pending = false;
    let mut deadline: Option<Instant> = None;

    loop {
        let timeout = deadline
            .map(|d| d.saturating_duration_since(Instant::now()))
            .unwrap_or(Duration::from_secs(3600));

        match rx.recv_timeout(timeout) {
            Ok(Ok(event)) => {
                if event.paths.iter().all(|p| is_ignored(p)) {
                    continue;
                }
                pending = true;
                deadline = Some(Instant::now() + Duration::from_millis(DEBOUNCE_MS));
            }
            Ok(Err(_)) => continue,
            Err(RecvTimeoutError::Timeout) => {
                if pending {
                    let _ = app_handle.emit("fs:changed", ());
                    pending = false;
                    deadline = None;
                }
            }
            // Sender dropped: watcher replaced or app shutting down. Exit thread.
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}
