import { assembleSystemPrompt } from "../../src/lib/agent/systemPrompt/assemble";
import type { ResolvedModelSettings } from "../../src/lib/modelSettings";
import type { ChatMode } from "../../src/lib/stores/mode";
import { getModeBasePrompt } from "../../src/lib/stores/mode";
import type { LLMTestCase } from "./types";

const PLAN_MODE_EXTRA = `When the user asks you to create or update a plan, write a markdown file under plans/ with YAML frontmatter:
- id, status (draft | in_progress | done | blocked), created, updated (ISO dates)
- A ## Tasks section with GFM checkboxes (- [ ] / - [x])
- Only write files under plans/ — never modify code outside plans/`;

export function resolveEvalSystemPrompt(input: {
  test: LLMTestCase;
  workspacePath: string;
  modelSettings: ResolvedModelSettings;
}): string {
  if (input.test.systemPrompt) return input.test.systemPrompt;

  const mode: ChatMode = input.test.mode;
  if (mode === "chat") {
    return getModeBasePrompt("chat");
  }

  const userPromptText = mode === "plan" ? PLAN_MODE_EXTRA : "";
  const toolsEnabled = mode === "agent" || mode === "plan" || (input.test.tools?.length ?? 0) > 0;

  const { prompt } = assembleSystemPrompt({
    mode,
    workspacePath: input.workspacePath,
    includeWorkspaceInChat: false,
    userPromptText,
    toolsEnabled,
    modelSettings: input.modelSettings,
  });

  return prompt;
}
