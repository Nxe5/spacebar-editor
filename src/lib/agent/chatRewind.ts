import { get } from "svelte/store";
import type { Message } from "../stores/chat";
import { pathsFromToolInput, workspaceRelativePath } from "./toolDisplay";
import { normalizeFilePath } from "../fsPath";
import {
  gitCreateCheckpoint,
  gitDiscard,
  gitIsRepo,
  gitRestoreCheckpoint,
  isTauriAvailable,
  readFile,
} from "../ipc";
import { files } from "../stores/files";
import { refreshVisibleExplorer } from "../filesystemSync";
import { bumpGitRefresh } from "../stores/gitRefresh";
import { getLanguageFromPath } from "../ipc";

/** Index of a user message, or -1 if missing / not a user message. */
export function indexOfUserMessage(messages: Message[], userMessageId: string): number {
  const idx = messages.findIndex((m) => m.id === userMessageId);
  if (idx < 0 || messages[idx]?.role !== "user") return -1;
  return idx;
}

/** Workspace paths touched by agent tools after `userIndex` (inclusive of later turns). */
export function pathsTouchedAfterUserIndex(
  messages: Message[],
  userIndex: number,
  workspacePath: string
): string[] {
  const paths = new Set<string>();
  for (let i = userIndex + 1; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.toolPaths?.length) {
      for (const p of m.toolPaths) paths.add(normalizeFilePath(p));
    }
    if (m.role === "tool" && m.toolName && m.toolInput) {
      for (const p of pathsFromToolInput(m.toolName, m.toolInput, workspacePath)) {
        paths.add(p);
      }
    }
    if (m.role === "assistant" && m.rawToolCalls?.length) {
      for (const tc of m.rawToolCalls) {
        try {
          const input = JSON.parse(tc.arguments) as Record<string, unknown>;
          for (const p of pathsFromToolInput(tc.name, input, workspacePath)) {
            paths.add(p);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  return [...paths];
}

export async function createCheckpointBeforeUserMessage(
  workspacePath: string,
  sessionId: string
): Promise<string | undefined> {
  if (!isTauriAvailable()) return undefined;
  try {
    const isRepo = await gitIsRepo(workspacePath);
    if (!isRepo) return undefined;
    const suffix = `${sessionId}-${crypto.randomUUID()}`;
    return await gitCreateCheckpoint(workspacePath, suffix);
  } catch {
    return undefined;
  }
}

async function revertPathsFallback(
  repoPath: string,
  messages: Message[],
  userIndex: number
): Promise<string[]> {
  const paths = pathsTouchedAfterUserIndex(messages, userIndex, repoPath);
  const errors: string[] = [];
  for (const abs of paths) {
    const rel = workspaceRelativePath(repoPath, abs);
    try {
      await gitDiscard(repoPath, rel);
    } catch {
      errors.push(rel);
    }
  }
  return errors;
}

export async function restoreWorkspaceAfterRewind(workspacePath: string): Promise<void> {
  const state = get(files);
  for (const open of state.openFiles) {
    try {
      const content = await readFile(null, open.path);
      files.openFile({
        path: open.path,
        name: open.name,
        content,
        isDirty: false,
        language: open.language || getLanguageFromPath(open.path),
      });
    } catch {
      files.closeFile(open.path);
    }
  }
  await refreshVisibleExplorer(workspacePath);
  bumpGitRefresh();
}

export async function applyFilesystemRewind(
  workspacePath: string,
  messages: Message[],
  userIndex: number,
  checkpointOid?: string
): Promise<{ usedCheckpoint: boolean; pathFallbackErrors: string[] }> {
  if (!isTauriAvailable()) {
    return { usedCheckpoint: false, pathFallbackErrors: [] };
  }

  const isRepo = await gitIsRepo(workspacePath).catch(() => false);
  if (!isRepo) {
    return { usedCheckpoint: false, pathFallbackErrors: [] };
  }

  if (checkpointOid) {
    try {
      await gitRestoreCheckpoint(workspacePath, checkpointOid);
      return { usedCheckpoint: true, pathFallbackErrors: [] };
    } catch {
      /* fall through to per-path discard */
    }
  }

  const pathFallbackErrors = await revertPathsFallback(workspacePath, messages, userIndex);
  return { usedCheckpoint: false, pathFallbackErrors };
}
