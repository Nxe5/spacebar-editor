use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

pub fn list_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let read_dir = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.')
            || file_name == "node_modules"
            || file_name == "target"
            || file_name == "dist"
        {
            continue;
        }

        let file_path = entry.path();
        let is_dir = file_path.is_dir();

        entries.push(FileEntry {
            name: file_name,
            path: file_path.to_string_lossy().to_string(),
            is_dir,
            children: None,
        });
    }

    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

pub fn read_file_contents(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn write_file_contents(path: &str, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}
