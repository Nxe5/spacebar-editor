#![allow(dead_code)]

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::channel;
use tauri::{AppHandle, Emitter};

pub struct FsWatcher {
    _watcher: RecommendedWatcher,
}

impl FsWatcher {
    pub fn new(app_handle: AppHandle, watch_path: &str) -> Result<Self, String> {
        let (tx, rx) = channel();

        let mut watcher = RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string())?;

        watcher
            .watch(Path::new(watch_path), RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;

        std::thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                if let Ok(event) = event {
                    let _ = app_handle.emit("fs:changed", event.paths);
                }
            }
        });

        Ok(Self { _watcher: watcher })
    }
}
