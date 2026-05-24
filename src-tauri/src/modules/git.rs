use git2::{Repository, Signature, Status, StatusOptions};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct GitPathStatus {
    pub path: String,
    pub index: String,
    pub worktree: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitLogEntry {
    pub oid: String,
    pub summary: String,
    pub author: String,
    pub time: i64,
}

fn open_repo(repo_path: &str) -> Result<Repository, String> {
    Repository::open(repo_path).map_err(|e| format!("Not a git repository: {e}"))
}

fn tag_status(s: Status) -> (String, String) {
    let mut idx = String::new();
    let mut wt = String::new();
    if s.is_index_new() {
        idx.push('A');
    } else if s.is_index_modified() {
        idx.push('M');
    } else if s.is_index_deleted() {
        idx.push('D');
    } else if s.is_index_renamed() {
        idx.push('R');
    }
    if s.is_wt_new() {
        wt.push_str("??");
    } else if s.is_wt_modified() {
        wt.push('M');
    } else if s.is_wt_deleted() {
        wt.push('D');
    } else if s.is_wt_renamed() {
        wt.push('R');
    }
    if idx.is_empty() {
        idx.push('-');
    }
    if wt.is_empty() {
        wt.push('-');
    }
    (idx, wt)
}

pub fn git_current_branch(repo_path: &str) -> Result<Option<String>, String> {
    let repo = open_repo(repo_path)?;
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(None),
    };
    Ok(head.shorthand().map(|s| s.to_string()))
}

pub fn git_status(repo_path: &str) -> Result<Vec<GitPathStatus>, String> {
    let repo = open_repo(repo_path)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    opts.include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut out: Vec<GitPathStatus> = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let (index, worktree) = tag_status(entry.status());
        out.push(GitPathStatus {
            path,
            index,
            worktree,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

pub fn git_diff(repo_path: &str, path: Option<&str>) -> Result<String, String> {
    let repo = open_repo(repo_path)?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let tree = head.peel_to_tree().map_err(|e| e.to_string())?;
    let mut diffopts = git2::DiffOptions::new();
    if let Some(p) = path {
        let trimmed = p.trim();
        if !trimmed.is_empty() && trimmed != "." {
            diffopts.pathspec(trimmed);
        }
    }
    let diff = repo
        .diff_tree_to_workdir(Some(&tree), Some(&mut diffopts))
        .map_err(|e| e.to_string())?;
    let mut patch: Vec<u8> = Vec::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        patch.extend_from_slice(line.content());
        true
    })
    .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&patch).to_string())
}

pub fn git_stage(repo_path: &str, path: &str) -> Result<(), String> {
    let repo = open_repo(repo_path)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index.add_path(Path::new(path)).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn git_unstage(repo_path: &str, path: &str) -> Result<(), String> {
    let repo = open_repo(repo_path)?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let obj = head.peel(git2::ObjectType::Commit).map_err(|e| e.to_string())?;
    repo
        .reset_default(Some(&obj), std::iter::once(path))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn git_commit(repo_path: &str, message: &str) -> Result<String, String> {
    let repo = open_repo(repo_path)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    let sig = repo
        .signature()
        .or_else(|_| Signature::now("Tiny Llama", "tinyllama@localhost"))
        .map_err(|e| e.to_string())?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let oid = if let Some(p) = parent {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&p])
    } else {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])
    }
    .map_err(|e| e.to_string())?;
    Ok(oid.to_string())
}

pub fn git_log(repo_path: &str, limit: usize) -> Result<Vec<GitLogEntry>, String> {
    let repo = open_repo(repo_path)?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let cap = limit.max(1).min(500);
    for (i, oid) in revwalk.enumerate() {
        if i >= cap {
            break;
        }
        let oid = oid.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let summary = commit.summary().unwrap_or("").to_string();
        let author = commit.author().name().unwrap_or("").to_string();
        let time = commit.time().seconds();
        out.push(GitLogEntry {
            oid: oid.to_string(),
            summary,
            author,
            time,
        });
    }
    Ok(out)
}

pub fn git_file_at_head(repo_path: &str, path: &str) -> Result<Option<String>, String> {
    let repo = open_repo(repo_path)?;
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(None),
    };
    let tree = head.peel_to_tree().map_err(|e| e.to_string())?;
    let entry = match tree.get_path(Path::new(path)) {
        Ok(e) => e,
        Err(_) => return Ok(None),
    };
    if entry.kind() != Some(git2::ObjectType::Blob) {
        return Err("Path is not a file at HEAD".into());
    }
    let blob = repo.find_blob(entry.id()).map_err(|e| e.to_string())?;
    Ok(Some(String::from_utf8_lossy(blob.content()).to_string()))
}

pub fn git_discard(repo_path: &str, path: &str) -> Result<(), String> {
    let repo = open_repo(repo_path)?;
    let mut opts = StatusOptions::new();
    opts.pathspec(path);
    opts.include_untracked(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let is_untracked = statuses
        .iter()
        .find(|e| e.path() == Some(path))
        .map(|e| e.status().is_wt_new())
        .unwrap_or(false);

    if is_untracked {
        let full = Path::new(repo_path).join(path);
        if full.is_dir() {
            std::fs::remove_dir_all(&full).map_err(|e| e.to_string())?;
        } else if full.exists() {
            std::fs::remove_file(&full).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    let head = repo.head().map_err(|e| e.to_string())?;
    let tree = head.peel_to_tree().map_err(|e| e.to_string())?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.path(path).force();
    repo.checkout_tree(tree.as_object(), Some(&mut checkout))
        .map_err(|e| e.to_string())?;
    Ok(())
}
