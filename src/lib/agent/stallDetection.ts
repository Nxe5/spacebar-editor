/** Detect repeated identical tool calls within an agent run (spec 22 §6). */

export const STALL_WINDOW = 3;

export function argsHash(args: Record<string, unknown>): string {
  const stable = JSON.stringify(args, Object.keys(args).sort());
  let h = 5381;
  for (let i = 0; i < stable.length; i++) {
    h = ((h << 5) + h) ^ stable.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export type ToolCallFingerprint = { name: string; argsHash: string };

export function fingerprintToolCall(name: string, args: Record<string, unknown>): ToolCallFingerprint {
  return { name, argsHash: argsHash(args) };
}

export function fingerprintKey(fp: ToolCallFingerprint): string {
  return `${fp.name}:${fp.argsHash}`;
}

export class StallTracker {
  private window: ToolCallFingerprint[] = [];

  /** Record a tool call; returns stall action if threshold met. */
  record(name: string, args: Record<string, unknown>): "none" | "nudge" | "abort" {
    const fp = fingerprintToolCall(name, args);
    const key = fingerprintKey(fp);
    this.window.push(fp);
    if (this.window.length > STALL_WINDOW) {
      this.window.shift();
    }
    const repeats = this.window.filter((x) => fingerprintKey(x) === key).length;
    if (repeats >= 3) return "abort";
    if (repeats >= 2) return "nudge";
    return "none";
  }

  resetOnProgress(name: string, args: Record<string, unknown>) {
    const key = fingerprintKey(fingerprintToolCall(name, args));
    const last = this.window[this.window.length - 1];
    if (last && fingerprintKey(last) !== key) {
      this.window = [last];
    }
  }
}

export function stallNudgeMessage(toolName: string): string {
  return `[Note: you called ${toolName} with identical arguments twice. Review the previous result and try a different approach.]`;
}
