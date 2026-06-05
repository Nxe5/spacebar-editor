/** Spill oversized shell output to `.sidebar/runs/` (spec 41 companion). */

import { readFile, writeFile } from "../ipc";
import { joinPath } from "./pathUtils";

export const SHELL_OUTPUT_CAP_BYTES = 48 * 1024;

export type RunIndexEntry = {
  id: string;
  tool: string;
  timestamp: number;
  bytes: number;
  logPath: string;
  exitCode?: number;
  command?: string;
};

const RUNS_DIR = ".sidebar/runs";
const INDEX_REL = ".sidebar/runs/index.json";
const MAX_INDEX_ENTRIES = 200;

function truncateUtf8(text: string, maxBytes: number): { head: string; truncated: boolean; totalBytes: number } {
  const totalBytes = new TextEncoder().encode(text).length;
  if (totalBytes <= maxBytes) {
    return { head: text, truncated: false, totalBytes };
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (new TextEncoder().encode(text.slice(0, mid)).length <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return { head: text.slice(0, lo), truncated: true, totalBytes };
}

/** @internal exported for unit tests */
export function truncateUtf8Logic(text: string, maxBytes: number) {
  return truncateUtf8(text, maxBytes);
}

async function readIndex(workspacePath: string): Promise<RunIndexEntry[]> {
  try {
    const raw = await readFile(workspacePath, joinPath(workspacePath, INDEX_REL));
    const parsed = JSON.parse(raw) as RunIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendIndex(workspacePath: string, entry: RunIndexEntry): Promise<void> {
  const list = await readIndex(workspacePath);
  list.push(entry);
  const trimmed = list.slice(-MAX_INDEX_ENTRIES);
  await writeFile(workspacePath, joinPath(workspacePath, INDEX_REL), `${JSON.stringify(trimmed, null, 2)}\n`);
}

/**
 * Cap shell tool output; spill full text to `.sidebar/runs/<id>.log` when truncated.
 */
export async function capShellToolOutput(
  workspacePath: string,
  fullOutput: string,
  meta: { command: string; exitCode: number | null | undefined }
): Promise<string> {
  const { head, truncated, totalBytes } = truncateUtf8(fullOutput, SHELL_OUTPUT_CAP_BYTES);
  if (!truncated) return fullOutput;

  const id = crypto.randomUUID();
  const logRel = `${RUNS_DIR}/${id}.log`;
  const logAbs = joinPath(workspacePath, logRel);
  await writeFile(workspacePath, logAbs, fullOutput);
  await appendIndex(workspacePath, {
    id,
    tool: "run_shell",
    timestamp: Date.now(),
    bytes: totalBytes,
    logPath: logRel,
    exitCode: meta.exitCode ?? undefined,
    command: meta.command,
  });

  const kb = Math.round(totalBytes / 1024);
  const capKb = Math.round(SHELL_OUTPUT_CAP_BYTES / 1024);
  return `${head}\n\n[output truncated — ${kb}KB total, showing first ~${capKb}KB]\nFull log: ${logRel}`;
}
