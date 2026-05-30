import type { ChatMode } from "../stores/mode";
import type { SystemPromptEntry, SystemPromptsConfig } from "./types";

export const PROMPTS_CONFIG_REL = ".tinyllama/prompts.json";
export const PROMPTS_DIR_REL = ".tinyllama/prompts";

const MODES: ChatMode[] = ["chat", "plan", "agent"];

export const ALL_PROMPT_MODES: ChatMode[] = [...MODES];

export function promptsDirPath(workspacePath: string): string {
  const base = workspacePath.replace(/\/+$/, "");
  return `${base}/${PROMPTS_DIR_REL}`;
}

export function promptsConfigPath(workspacePath: string): string {
  const base = workspacePath.replace(/\/+$/, "");
  return `${base}/${PROMPTS_CONFIG_REL}`;
}

export function promptFilePath(workspacePath: string, filename: string): string {
  return `${promptsDirPath(workspacePath)}/${filename}`;
}

export function defaultPromptsConfig(): SystemPromptsConfig {
  return {
    version: 1,
    prompts: [
      {
        id: "chat",
        filename: "chat.md",
        label: "Chat",
        enabled: false,
        modes: ["chat"],
      },
      {
        id: "plan",
        filename: "plan.md",
        label: "Plan",
        enabled: false,
        modes: ["plan"],
      },
      {
        id: "agent",
        filename: "agent.md",
        label: "Agent",
        enabled: false,
        modes: ["agent"],
      },
    ],
  };
}

function normalizeModes(raw: unknown): ChatMode[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is ChatMode => MODES.includes(m as ChatMode));
}

export function normalizePromptEntry(raw: Partial<SystemPromptEntry>): SystemPromptEntry | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const filename = typeof raw.filename === "string" ? raw.filename.trim() : "";
  if (!id || !filename || !filename.endsWith(".md")) return null;
  if (filename.includes("/") || filename.includes("..")) return null;
  const label =
    typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : filename.replace(/\.md$/, "");
  return {
    id,
    filename,
    label,
    enabled: raw.enabled === true,
    modes: normalizeModes(raw.modes),
  };
}

export function normalizePromptsConfig(raw: unknown): SystemPromptsConfig {
  const base = defaultPromptsConfig();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<SystemPromptsConfig>;
  const prompts = Array.isArray(obj.prompts)
    ? obj.prompts.map((p) => normalizePromptEntry(p as Partial<SystemPromptEntry>)).filter(Boolean)
    : [];
  return {
    version: 1,
    prompts: prompts.length ? (prompts as SystemPromptEntry[]) : base.prompts,
  };
}

export function slugifyPromptName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "prompt";
}

export function uniquePromptFilename(entries: SystemPromptEntry[], stem: string): string {
  let candidate = `${stem}.md`;
  let n = 2;
  const used = new Set(entries.map((e) => e.filename));
  while (used.has(candidate)) {
    candidate = `${stem}-${n}.md`;
    n += 1;
  }
  return candidate;
}

export function uniquePromptId(entries: SystemPromptEntry[], stem: string): string {
  let candidate = stem;
  let n = 2;
  const used = new Set(entries.map((e) => e.id));
  while (used.has(candidate)) {
    candidate = `${stem}-${n}`;
    n += 1;
  }
  return candidate;
}

export function combinePromptContents(
  entries: SystemPromptEntry[],
  contents: Record<string, string>,
  mode: ChatMode
): string {
  const blocks: string[] = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    if (entry.modes.length > 0 && !entry.modes.includes(mode)) continue;
    const text = contents[entry.filename]?.trim();
    if (!text) continue;
    blocks.push(`### ${entry.label}\n${text}`);
  }
  return blocks.join("\n\n");
}

/** Modes this entry applies to (`[]` in storage = all modes). */
export function resolvedPromptModes(entry: SystemPromptEntry): ChatMode[] {
  return entry.modes.length ? [...entry.modes] : [...ALL_PROMPT_MODES];
}

export function promptModesSummary(entry: SystemPromptEntry): string {
  const modes = resolvedPromptModes(entry);
  if (modes.length === ALL_PROMPT_MODES.length) return "All modes";
  const labels: Record<ChatMode, string> = { chat: "Chat", plan: "Plan", agent: "Agent" };
  return modes.map((m) => labels[m]).join(", ");
}

export function togglePromptMode(
  entry: SystemPromptEntry,
  mode: ChatMode,
  on: boolean
): ChatMode[] {
  let next = new Set(resolvedPromptModes(entry));
  if (on) next.add(mode);
  else next.delete(mode);
  const ordered = ALL_PROMPT_MODES.filter((m) => next.has(m));
  return ordered.length === ALL_PROMPT_MODES.length ? [] : ordered;
}

export function isPromptFilePath(path: string, workspacePath: string | null): boolean {
  if (!workspacePath) return false;
  const dir = promptsDirPath(workspacePath);
  const normalized = path.replace(/\/+$/, "");
  return normalized.startsWith(`${dir}/`) && normalized.endsWith(".md");
}

export function defaultPromptTemplate(label: string): string {
  return `# ${label}\n\nCustom instructions appended to the ${label.toLowerCase()} mode system prompt.\n`;
}

export const BUILTIN_PROMPT_IDS: ChatMode[] = ["chat", "plan", "agent"];

export function isBuiltinPromptEntry(entry: SystemPromptEntry): boolean {
  return BUILTIN_PROMPT_IDS.includes(entry.id as ChatMode);
}

/** Default on-disk content when resetting a built-in mode prompt or creating files. */
export function defaultPromptContentForEntry(entry: SystemPromptEntry): string {
  switch (entry.id) {
    case "chat":
      return `# Chat\n\nOptional instructions for chat mode (no tools). Keep answers concise unless the user asks for detail.\n`;
    case "plan":
      return `# Plan\n\nOptional instructions for plan mode (read-only tools). Prefer analysis, tradeoffs, and step-by-step plans before any implementation.\n`;
    case "agent":
      return `# Agent\n\nOptional instructions for agent mode (full tools). Prefer small, verifiable edits and explain what you changed.\n`;
    default:
      return defaultPromptTemplate(entry.label);
  }
}

export function builtinEntryForMode(
  entries: SystemPromptEntry[],
  mode: ChatMode
): SystemPromptEntry | undefined {
  return entries.find((e) => e.id === mode);
}
