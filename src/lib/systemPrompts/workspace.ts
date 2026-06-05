import {
  readFile,
  writeFile,
  isTauriAvailable,
  readSystemPrompt,
  deleteEntry,
  ensureSystemPromptsLayout,
} from "../ipc";
import {
  defaultPromptTemplate,
  defaultPromptsConfig,
  normalizePromptsConfig,
  promptFilePath,
  promptsConfigPath,
  uniquePromptFilename,
  uniquePromptId,
  slugifyPromptName,
} from "./config";
import type { SystemPromptEntry, SystemPromptsConfig } from "./types";

export type PromptsWorkspaceSnapshot = {
  config: SystemPromptsConfig;
  contents: Record<string, string>;
  initialized: boolean;
};

async function readConfigFile(workspacePath: string): Promise<SystemPromptsConfig | null> {
  try {
    const raw = await readFile(workspacePath, promptsConfigPath(workspacePath));
    return normalizePromptsConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeConfigFile(workspacePath: string, config: SystemPromptsConfig): Promise<void> {
  await ensureSystemPromptsLayout(workspacePath);
  await writeFile(workspacePath, promptsConfigPath(workspacePath), `${JSON.stringify(config, null, 2)}\n`);
}

async function writePromptFile(
  workspacePath: string,
  entry: SystemPromptEntry,
  content: string
): Promise<void> {
  await ensureSystemPromptsLayout(workspacePath);
  await writeFile(workspacePath, promptFilePath(workspacePath, entry.filename), content);
}

function configIsInitialized(
  config: SystemPromptsConfig,
  contents: Record<string, string>,
  configOnDisk: boolean
): boolean {
  if (!configOnDisk) return false;
  return config.prompts.every((entry) => Object.hasOwn(contents, entry.filename));
}

/** Read prompt manifest + files without creating anything on disk. */
export async function readPromptsWorkspace(workspacePath: string): Promise<PromptsWorkspaceSnapshot> {
  const defaults = defaultPromptsConfig();
  if (!isTauriAvailable()) {
    return { config: defaults, contents: {}, initialized: false };
  }

  const configFromDisk = await readConfigFile(workspacePath);
  const configOnDisk = configFromDisk !== null;
  const config = configFromDisk ?? defaults;

  const contents: Record<string, string> = {};
  for (const entry of config.prompts) {
    try {
      contents[entry.filename] = await readFile(workspacePath, promptFilePath(workspacePath, entry.filename));
    } catch {
      /* missing file */
    }
  }

  return {
    config,
    contents,
    initialized: configIsInitialized(config, contents, configOnDisk),
  };
}

async function migrateLegacyPromptContent(workspacePath: string): Promise<string> {
  try {
    return (await readSystemPrompt(workspacePath))?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Create `.sidebar/prompts/` layout, default files, and prompts.json if missing. */
export async function initializePromptFiles(workspacePath: string): Promise<PromptsWorkspaceSnapshot> {
  if (!isTauriAvailable()) {
    throw new Error("Prompt files can only be created in the desktop app.");
  }

  await ensureSystemPromptsLayout(workspacePath);

  const existing = await readConfigFile(workspacePath);
  const config = existing ?? defaultPromptsConfig();
  const legacy = existing ? "" : await migrateLegacyPromptContent(workspacePath);

  for (const entry of config.prompts) {
    let content = defaultPromptContentForEntry(entry);
    if (entry.id === "agent" && legacy) {
      content = legacy;
      entry.enabled = true;
    }
    try {
      await readFile(workspacePath, promptFilePath(workspacePath, entry.filename));
    } catch {
      await writePromptFile(workspacePath, entry, content);
    }
  }

  if (!existing) {
    await writeConfigFile(workspacePath, config);
  }

  return readPromptsWorkspace(workspacePath);
}

export async function savePromptsConfig(
  workspacePath: string,
  prompts: SystemPromptEntry[]
): Promise<SystemPromptsConfig> {
  const config: SystemPromptsConfig = { version: 1, prompts };
  await writeConfigFile(workspacePath, config);
  return config;
}

export async function createPromptFile(
  workspacePath: string,
  entries: SystemPromptEntry[],
  displayName: string,
  initialContent?: string
): Promise<{ entry: SystemPromptEntry; content: string }> {
  const stem = slugifyPromptName(displayName);
  const filename = uniquePromptFilename(entries, stem);
  const id = uniquePromptId(entries, stem);
  const label = displayName.trim() || filename.replace(/\.md$/, "");
  const entry: SystemPromptEntry = {
    id,
    filename,
    label,
    enabled: true,
    modes: [],
  };
  const trimmed = initialContent?.trim();
  const content = trimmed ? trimmed : defaultPromptTemplate(label);
  await writePromptFile(workspacePath, entry, content);
  return { entry, content };
}

export async function savePromptFileContent(
  workspacePath: string,
  entry: SystemPromptEntry,
  content: string
): Promise<void> {
  await writePromptFile(workspacePath, entry, content);
}

export async function deletePromptFile(workspacePath: string, entry: SystemPromptEntry): Promise<void> {
  const path = promptFilePath(workspacePath, entry.filename);
  try {
    await deleteEntry(workspacePath, path);
  } catch {
    /* ignore missing */
  }
}

/** @deprecated Use readPromptsWorkspace / initializePromptFiles */
export async function loadPromptsWorkspace(workspacePath: string): Promise<PromptsWorkspaceSnapshot> {
  const snapshot = await readPromptsWorkspace(workspacePath);
  if (snapshot.initialized) return snapshot;
  return snapshot;
}

export { promptFilePath, promptsConfigPath } from "./config";
