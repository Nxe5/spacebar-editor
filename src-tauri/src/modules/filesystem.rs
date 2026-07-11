use ignore::overrides::OverrideBuilder;
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Workspace path enforcement (Spec 33)
// ---------------------------------------------------------------------------

/// Resolves `path` against `workspace_root` and verifies the result stays
/// inside the workspace, including through symlinks. Returns the resolved
/// absolute path. On Windows uses `dunce::canonicalize` to avoid UNC paths.
pub fn canonicalize_workspace_path(
    workspace_root: &Path,
    path: &Path,
) -> Result<PathBuf, String> {
    let root = canon(workspace_root)
        .map_err(|e| format!("Cannot resolve workspace root: {e}"))?;

    let candidate = if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    };

    let resolved = if candidate.exists() {
        canon(&candidate).map_err(|e| format!("Cannot resolve path: {e}"))?
    } else {
        // Path doesn't exist yet (e.g. create_file target).
        // Canonicalize the deepest existing ancestor, then re-append the rest.
        let mut existing = candidate.clone();
        let mut suffix = PathBuf::new();
        loop {
            if existing.exists() {
                break;
            }
            if let Some(name) = existing.file_name() {
                if suffix.as_os_str().is_empty() {
                    suffix = PathBuf::from(name);
                } else {
                    suffix = PathBuf::from(name).join(&suffix);
                }
            }
            match existing.parent() {
                Some(p) => existing = p.to_path_buf(),
                None => break,
            }
        }
        let base = if existing.exists() {
            canon(&existing).map_err(|e| format!("Cannot resolve parent: {e}"))?
        } else {
            root.clone()
        };
        base.join(suffix)
    };

    if !resolved.starts_with(&root) {
        return Err(format!(
            "workspace_escape: '{}' is outside the workspace root '{}'",
            resolved.display(),
            root.display()
        ));
    }

    Ok(resolved)
}

#[cfg(target_os = "windows")]
fn canon(p: &Path) -> std::io::Result<PathBuf> {
    dunce::canonicalize(p)
}

#[cfg(not(target_os = "windows"))]
fn canon(p: &Path) -> std::io::Result<PathBuf> {
    p.canonicalize()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

/// Directories always excluded from trees/search regardless of `.gitignore`.
/// These are vendored or generated and only waste model context / UI space.
const ALWAYS_EXCLUDE: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".svelte-kit",
    ".turbo",
    "coverage",
    ".venv",
    "vendor",
    "__pycache__",
    ".git",
];

/// Build a `WalkBuilder` configured with `.gitignore` semantics (globs,
/// negation, nested ignore files) plus our always-exclude overrides. Hidden
/// dotfiles are shown so users can see `.sidebar`, `.env`, etc. in the explorer.
fn ignore_walk_builder(root: &Path) -> WalkBuilder {
    let mut overrides = OverrideBuilder::new(root);
    for name in ALWAYS_EXCLUDE {
        // `!pattern` in an override means "exclude this".
        let _ = overrides.add(&format!("!{name}/**"));
        let _ = overrides.add(&format!("!{name}"));
    }
    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .parents(true)
        .follow_links(false);
    if let Ok(ov) = overrides.build() {
        builder.overrides(ov);
    }
    builder
}

pub fn list_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    // Start the walk at `path` (with `parents(true)`) so ancestor `.gitignore`
    // rules still apply, but limit to direct children for a single-level listing.
    let mut entries: Vec<FileEntry> = Vec::new();

    for result in ignore_walk_builder(path).max_depth(Some(1)).build() {
        let Ok(entry) = result else { continue };
        let entry_path = entry.path();
        // depth 0 is `path` itself.
        if entry.depth() == 0 {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(FileEntry {
            name: file_name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            children: None,
        });
    }

    sort_entries(&mut entries);
    Ok(entries)
}

fn sort_entries(entries: &mut [FileEntry]) {
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
}

const READ_FILE_HARD_CHAR_CAP: usize = 50_000;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileResult {
    pub content: String,
    pub start_line: u32,
    pub end_line: u32,
    pub total_lines: u32,
    pub truncated: bool,
    pub hard_capped: bool,
}

pub fn read_file_ranged(
    path: &str,
    start_line: Option<u32>,
    max_lines: Option<u32>,
) -> Result<ReadFileResult, String> {
    if start_line.is_none() && max_lines.is_none() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let total = content.lines().count().max(1) as u32;
        return Ok(ReadFileResult {
            content,
            start_line: 1,
            end_line: total,
            total_lines: total,
            truncated: false,
            hard_capped: false,
        });
    }

    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = raw.split_inclusive('\n').collect();
    let total = lines.len().max(1) as u32;
    let start = start_line.unwrap_or(1).max(1);
    let max = max_lines.unwrap_or(500).max(1).min(5000);
    if start > total {
        return Ok(ReadFileResult {
            content: format!("[start_line {start} is past end of file ({total} lines)]"),
            start_line: start,
            end_line: start.saturating_sub(1),
            total_lines: total,
            truncated: false,
            hard_capped: false,
        });
    }
    let start_idx = (start - 1) as usize;
    let end_idx = (start_idx + max as usize).min(lines.len());
    let mut slice = lines[start_idx..end_idx].concat();
    let end_line = end_idx as u32;
    let truncated = end_idx < lines.len();
    let mut hard_capped = false;
    if slice.len() > READ_FILE_HARD_CHAR_CAP {
        slice = slice[..READ_FILE_HARD_CHAR_CAP].to_string();
        hard_capped = true;
    }
    Ok(ReadFileResult {
        content: slice,
        start_line: start,
        end_line,
        total_lines: total,
        truncated,
        hard_capped,
    })
}

/// Ancestor directories that did not exist before this write (deepest-first).
fn missing_ancestor_dirs(parent: &Path) -> Vec<std::path::PathBuf> {
    let mut missing = Vec::new();
    let mut current = Some(parent);
    while let Some(dir) = current {
        if dir.as_os_str().is_empty() {
            break;
        }
        if dir.exists() {
            break;
        }
        missing.push(dir.to_path_buf());
        current = dir.parent();
    }
    missing.reverse();
    missing
}

/// Write `path`, creating parent directories when needed.
/// Returns an optional audit line listing directories created (empty if none).
pub fn write_file_contents(path: &str, contents: &str) -> Result<String, String> {
    let file_path = Path::new(path);
    let mut audit = String::new();
    if let Some(parent) = file_path.parent() {
        if !parent.as_os_str().is_empty() {
            let created = missing_ancestor_dirs(parent);
            if !created.is_empty() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                let listed: Vec<String> = created
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                audit = format!("Created directories: {}\n\n", listed.join(", "));
            }
        }
    }
    fs::write(path, contents).map_err(|e| e.to_string())?;
    Ok(audit)
}

pub fn create_directory(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.exists() {
        return Err(format!("Path already exists: {path}"));
    }
    fs::create_dir_all(p).map_err(|e| e.to_string())
}

pub fn rename_path(from: &str, to: &str) -> Result<(), String> {
    fs::rename(from, to).map_err(|e| e.to_string())
}

pub fn delete_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

pub fn path_exists(path: &str) -> Result<bool, String> {
    Ok(Path::new(path).exists())
}

pub fn find_files(
    workspace_path: &str,
    glob_pattern: &str,
    max_results: usize,
) -> Result<Vec<String>, String> {
    let root = Path::new(workspace_path);
    if !root.is_dir() {
        return Err(format!("Workspace path is not a directory: {workspace_path}"));
    }
    let pattern = glob_pattern.trim();
    let mut out: Vec<String> = Vec::new();
    let limit = max_results.max(1).min(500);

    for result in ignore_walk_builder(root).build() {
        if out.len() >= limit {
            break;
        }
        let Ok(entry) = result else { continue };
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(true) {
            continue;
        }
        let p = entry.path();
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let rel = p
            .strip_prefix(root)
            .map(|r| r.to_string_lossy().to_string())
            .unwrap_or_else(|_| p.to_string_lossy().to_string());
        let matches = if pattern.contains('*') {
            glob_match_simple(pattern, name) || glob_match_simple(pattern, &rel)
        } else {
            name.contains(pattern) || rel.contains(pattern)
        };
        if matches {
            out.push(rel);
        }
    }
    out.sort();
    Ok(out)
}

fn glob_match_simple(pattern: &str, text: &str) -> bool {
    if pattern == "*" || pattern == "*.*" {
        return true;
    }
    if let Some(rest) = pattern.strip_prefix("*.") {
        return text.ends_with(&format!(".{rest}"));
    }
    if let Some(rest) = pattern.strip_suffix("*") {
        return text.starts_with(rest);
    }
    text.contains(pattern)
}

pub fn list_dir_tree(
    path: &str,
    max_depth: usize,
    max_entries: usize,
) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(path);
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", root.display()));
    }
    let mut count = 0usize;
    let limit = max_entries.max(1).min(2000);
    let depth_limit = max_depth.max(1).min(8);

    fn walk(
        dir: &Path,
        depth: usize,
        depth_limit: usize,
        count: &mut usize,
        limit: usize,
    ) -> Vec<FileEntry> {
        if *count >= limit || depth > depth_limit {
            return vec![];
        }
        let mut entries: Vec<FileEntry> = Vec::new();
        // max_depth(1): direct children only; nested `.gitignore`/exclude rules
        // still resolve because `parents(true)` reads ancestor ignore files.
        for result in ignore_walk_builder(dir).max_depth(Some(1)).build() {
            if *count >= limit {
                break;
            }
            let Ok(entry) = result else { continue };
            if entry.depth() == 0 {
                continue;
            }
            let file_path = entry.path().to_path_buf();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let file_name = entry.file_name().to_string_lossy().to_string();
            *count += 1;
            let children = if is_dir && depth < depth_limit {
                Some(walk(&file_path, depth + 1, depth_limit, count, limit))
            } else {
                None
            };
            entries.push(FileEntry {
                name: file_name,
                path: file_path.to_string_lossy().to_string(),
                is_dir,
                children,
            });
        }
        sort_entries(&mut entries);
        entries
    }

    Ok(walk(root, 0, depth_limit, &mut count, limit))
}

pub fn web_fetch(url: &str, allowed_hosts: &[String], max_bytes: usize) -> Result<String, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    let host = parsed.host_str().unwrap_or("").to_lowercase();
    if host.is_empty() {
        return Err("URL must include a host".to_string());
    }
    let allowed = allowed_hosts.iter().any(|h| h.to_lowercase() == host);
    if !allowed {
        return Err(format!(
            "Host '{host}' is not in the web fetch allowlist. Add it in Settings."
        ));
    }
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only http and https URLs are allowed".to_string());
    }

    let limit = max_bytes.max(1024).min(512_000);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(parsed)
        .send()
        .map_err(|e| format!("Fetch failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let bytes = response
        .bytes()
        .map_err(|e| e.to_string())?
        .iter()
        .take(limit)
        .copied()
        .collect::<Vec<u8>>();
    let text = String::from_utf8_lossy(&bytes).to_string();
    Ok(text)
}

#[cfg(test)]
mod write_tests {
    use super::*;

    #[test]
    fn canonicalize_new_file_at_workspace_root_and_write() {
        let base = std::env::temp_dir().join(format!(
            "tl_ws_root_write_{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&base).unwrap();
        let root = base.as_path();
        let resolved =
            canonicalize_workspace_path(root, Path::new("package.json")).expect("resolve");
        write_file_contents(&resolved.to_string_lossy(), r#"{"name":"x"}"#).expect("write");
        assert!(resolved.is_file());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn canonicalize_new_file_with_absolute_path_under_root() {
        let base = std::env::temp_dir().join(format!(
            "tl_ws_abs_write_{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&base).unwrap();
        let root = base.as_path();
        let abs = base.join("package.json");
        let resolved =
            canonicalize_workspace_path(root, abs.as_path()).expect("resolve");
        write_file_contents(&resolved.to_string_lossy(), "{}").expect("write");
        assert_eq!(fs::read_to_string(&resolved).unwrap(), "{}");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn canonicalize_new_file_when_parent_dir_exists() {
        let base = std::env::temp_dir().join(format!(
            "tl_ws_nested_write_{}",
            uuid::Uuid::new_v4()
        ));
        let src = base.join("src");
        fs::create_dir_all(&src).unwrap();
        let root = base.as_path();
        let resolved =
            canonicalize_workspace_path(root, Path::new("src/main.jsx")).expect("resolve");
        assert!(!resolved.to_string_lossy().ends_with('/'));
        write_file_contents(&resolved.to_string_lossy(), "export {}").expect("write");
        assert!(resolved.is_file());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn write_file_contents_creates_missing_parent_dirs() {
        let base = std::env::temp_dir().join(format!(
            "tl_write_test_{}_{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        let nested = base.join("glass_rainbow").join("__init__.py");
        let nested_str = nested.to_string_lossy().to_string();

        // Parent dirs do not exist yet — this used to fail with ENOENT.
        let audit = write_file_contents(&nested_str, "print(1)")
            .expect("should create parents and write");
        assert!(audit.contains("Created directories:"));
        assert!(audit.contains("glass_rainbow"));
        assert_eq!(fs::read_to_string(&nested).unwrap(), "print(1)");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn list_directory_reads_project_root() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("parent")
            .to_string_lossy()
            .to_string();
        let entries = list_directory(&root).expect("list project root");
        assert!(
            entries.iter().any(|e| e.name == "src-tauri" && e.is_dir),
            "expected src-tauri dir in {:?}",
            entries.iter().map(|e| &e.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn create_directory_makes_empty_folder() {
        let base = std::env::temp_dir().join(format!(
            "tl_mkdir_test_{}_{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        let dir = base.join("new-folder");
        create_directory(&dir.to_string_lossy()).expect("create dir");
        assert!(dir.is_dir());
        let _ = fs::remove_dir_all(&base);
    }
}
