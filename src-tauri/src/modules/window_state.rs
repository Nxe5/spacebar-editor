//! Per-window state registries.
//!
//! Tauri's `.manage()` state is process-wide, but PTY sessions, LSP servers,
//! the file watcher, and the workspace lock must each be scoped to whichever
//! window opened them — otherwise two independent editor windows (see the
//! Dock "New Window" feature) would share terminals, language servers, and
//! workspace locks with each other. Each subsystem keeps its existing
//! internal shape (e.g. `PtyManager` is still `Mutex<HashMap<String, ...>>`
//! keyed by session id); this registry just adds one more level, keyed by
//! window label, so every subsystem gets its own instance per window.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct WindowRegistry<T>(Mutex<HashMap<String, Arc<T>>>);

impl<T> Default for WindowRegistry<T> {
    fn default() -> Self {
        WindowRegistry(Mutex::new(HashMap::new()))
    }
}

impl<T: Default> WindowRegistry<T> {
    /// Returns the entry for `label`, creating one on first access.
    pub fn get_or_init(&self, label: &str) -> Arc<T> {
        let mut map = self.0.lock().unwrap();
        map.entry(label.to_string()).or_insert_with(|| Arc::new(T::default())).clone()
    }

    /// Removes and returns the entry for `label` — called when a window closes.
    pub fn remove(&self, label: &str) -> Option<Arc<T>> {
        self.0.lock().unwrap().remove(label)
    }
}

pub type PtyRegistry = WindowRegistry<crate::modules::pty::PtyManager>;
pub type WatcherRegistry = WindowRegistry<crate::modules::watcher::WatcherState>;
pub type LockRegistry = WindowRegistry<crate::modules::commands::ActiveLockPath>;
pub type LspRegistry = WindowRegistry<crate::modules::lsp::LspManager>;
