import type { ChatMode } from "../stores/mode";

export type SystemPromptEntry = {
  id: string;
  filename: string;
  label: string;
  enabled: boolean;
  /** When empty, the prompt applies in every chat mode. */
  modes: ChatMode[];
};

export type SystemPromptsConfig = {
  version: 1;
  prompts: SystemPromptEntry[];
};

export type SystemPromptsState = {
  entries: SystemPromptEntry[];
  /** Prompt file contents keyed by filename (e.g. `agent.md`). */
  contents: Record<string, string>;
  loaded: boolean;
  /** True when prompts.json and all manifest files exist on disk. */
  initialized: boolean;
};
