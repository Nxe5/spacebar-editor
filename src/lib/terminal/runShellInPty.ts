import type { ShellResult } from "../ipc";
import { isTauriAvailable, runShell } from "../ipc";
import { requestBottomPanelOpen } from "../stores/bottomPanel";
import { bottomTerminals } from "../stores/bottomTerminals";

function truncateCommandTitle(command: string): string {
  const oneLine = command.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 28) return oneLine;
  return `${oneLine.slice(0, 25)}…`;
}

function formatMirroredShellOutput(command: string, result: ShellResult): string {
  const parts = [`$ ${command}`];
  if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
  if (result.stderr.trim()) parts.push(`[stderr]\n${result.stderr.trimEnd()}`);
  parts.push(`[exit ${result.exit_code ?? "?"}]`);
  return `${parts.join("\n")}\n`;
}

/** Best-effort: show piped agent shell output in a read-only tab that auto-closes. */
function mirrorShellResultToAgentTab(command: string, result: ShellResult): void {
  requestBottomPanelOpen();
  bottomTerminals.createOutputTab({
    source: "agent",
    title: truncateCommandTitle(command),
    output: formatMirroredShellOutput(command, result),
  });
}

/**
 * Run agent shell via piped `sh -c` (reliable stdout/exit code), optionally mirroring
 * output to a bottom-panel tab. Avoids injecting commands into the user's interactive
 * login shell (zsh + themes), which breaks capture and exit-code detection.
 */
export async function runShellWithTerminalVisibility(
  workspacePath: string,
  command: string,
  timeoutMs = 120_000
): Promise<ShellResult> {
  const result = await runShell(workspacePath, command, timeoutMs);

  if (isTauriAvailable()) {
    try {
      mirrorShellResultToAgentTab(command, result);
    } catch {
      /* mirror is optional; never fail the tool */
    }
  }

  return result;
}
