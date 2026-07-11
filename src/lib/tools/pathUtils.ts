function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

export function isAbsolutePath(filePath: string): boolean {
  return filePath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(filePath);
}

export function joinPath(base: string, relative: string): string {
  const baseNorm = normalizePath(base);
  if (!baseNorm || baseNorm === "/") {
    throw new Error("Workspace path is not set or invalid");
  }
  const rel = relative.replace(/^\.\//, "").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) {
    throw new Error(`Invalid relative path: ${relative}`);
  }
  return `${baseNorm}/${rel}`;
}

/**
 * Resolve a tool path against the workspace.
 * Absolute paths under the workspace are kept; root-anchored mistakes like `/test.txt`
 * are treated as relative to the workspace root.
 */
export function resolvePath(workspacePath: string, filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("Path is empty");
  }

  if (isAbsolutePath(trimmed)) {
    const root = normalizePath(workspacePath);
    const target = normalizePath(trimmed);
    if (root && root !== "/" && (target === root || target.startsWith(`${root}/`))) {
      return target;
    }
    // Model often emits "/file.txt" meaning workspace root, not filesystem "/".
    const asRelative = trimmed.replace(/^\/+/, "");
    if (asRelative && !asRelative.includes("..") && !asRelative.includes("/")) {
      return joinPath(workspacePath, asRelative);
    }
    return target;
  }

  return joinPath(workspacePath, trimmed);
}

export function assertWithinWorkspace(workspacePath: string, resolvedPath: string): void {
  const root = normalizePath(workspacePath);
  if (!root || root === "/") {
    throw new Error("Workspace path is not set or invalid");
  }
  const target = normalizePath(resolvedPath);
  if (target === root) return;
  if (!target.startsWith(`${root}/`)) {
    throw new Error(`Path is outside the workspace: ${resolvedPath}`);
  }
}

export function resolveWorkspacePath(
  workspacePath: string,
  filePath: string,
  options?: { allowWorkspaceRoot?: boolean }
): string {
  const resolved = resolvePath(workspacePath, filePath);
  if (!options?.allowWorkspaceRoot) {
    assertWithinWorkspace(workspacePath, resolved);
  } else {
    const root = normalizePath(workspacePath);
    const target = normalizePath(resolved);
    if (target !== root && !target.startsWith(`${root}/`)) {
      throw new Error(`Path is outside the workspace: ${resolved}`);
    }
  }
  return resolved;
}

/** Workspace-relative path for IPC (avoids macOS /private prefix mismatches on absolute paths). */
export function toWorkspaceRelativePath(workspacePath: string, resolvedOrRelative: string): string {
  const root = normalizePath(workspacePath.trim());
  const target = normalizePath(resolvedOrRelative.trim());
  if (!root || root === "/") {
    throw new Error("Workspace path is not set or invalid");
  }
  if (target === root) return ".";
  const prefix = `${root}/`;
  if (target.startsWith(prefix)) {
    return target.slice(prefix.length);
  }
  if (!isAbsolutePath(target)) {
    return target.replace(/^\.\//, "");
  }
  return target;
}
