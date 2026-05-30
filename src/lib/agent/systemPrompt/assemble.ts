import { countTokens } from "../../chatContext";
import type { ResolvedModelSettings } from "../../modelSettings";
import { buildWorkspaceContextBlock } from "../workspaceContext";
import { MODE_CONFIG, type ChatMode } from "../../stores/mode";
import { buildToolUseInstruction, TOOL_SUMMARY_INSTRUCTION } from "./toolInstructions";

export type AssemblySection = {
  id: string;
  label: string;
  text: string;
  tokenEstimate: number;
};

export type AssembleSystemPromptInput = {
  mode: ChatMode;
  workspacePath: string | null;
  includeWorkspaceInChat: boolean;
  userPromptText: string;
  toolsEnabled: boolean;
  modelSettings: ResolvedModelSettings;
  /** Active skills text blocks (empty until skills ship). */
  skillBlocks?: Array<{ id: string; label: string; text: string }>;
};

function estimateSection(label: string, text: string): AssemblySection {
  const trimmed = text.trim();
  return {
    id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    text: trimmed,
    tokenEstimate: trimmed ? countTokens(trimmed) : 0,
  };
}

export function assembleSystemPrompt(input: AssembleSystemPromptInput): {
  prompt: string;
  sections: AssemblySection[];
} {
  const modeConfig = MODE_CONFIG[input.mode];
  const sections: AssemblySection[] = [];

  sections.push(
    estimateSection("Base mode prompt", modeConfig.basePrompt)
  );

  const includeWorkspace =
    input.mode !== "chat" || input.includeWorkspaceInChat;
  if (includeWorkspace) {
    sections.push(
      estimateSection("Workspace context", buildWorkspaceContextBlock(input.workspacePath))
    );
  }

  const toolsOn = input.toolsEnabled && modeConfig.tools.length > 0;
  if (toolsOn) {
    const toolInstr = buildToolUseInstruction({
      verbosity: input.modelSettings.promptVerbosity,
      parallelToolCalls: input.modelSettings.parallelToolCalls,
      textFallback: input.modelSettings.toolCallFormat === "text_fallback",
    });
    sections.push(
      estimateSection(
        `Tool instructions (${input.modelSettings.promptVerbosity})`,
        toolInstr
      )
    );
  }

  for (const skill of input.skillBlocks ?? []) {
    sections.push(estimateSection(skill.label, skill.text));
  }

  const userText = input.userPromptText.trim();
  if (userText) {
    sections.push(estimateSection("System prompts", userText));
  }

  if (toolsOn) {
    sections.push(estimateSection("Tool summary instruction", TOOL_SUMMARY_INSTRUCTION));
  }

  const prompt = sections
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n");

  return { prompt, sections };
}

export function assemblyTotalTokens(sections: AssemblySection[]): number {
  return sections.reduce((sum, s) => sum + s.tokenEstimate, 0);
}

export type AssemblyPreviewStatus = "active" | "skipped" | "placeholder";

export type AssemblyPreviewSection = {
  slotId: string;
  order: number;
  label: string;
  text: string;
  tokenEstimate: number;
  status: AssemblyPreviewStatus;
  /** Shown when skipped or placeholder — why this block is empty. */
  note?: string;
};

const SKILLS_SLOT_NOTE =
  "Skills inject here when active (stack detection, project rules, bundled packs). None configured yet.";

/** Full assembly preview for a mode, including empty/skipped slots in fixed order. */
export function buildAssemblyPreview(
  mode: ChatMode,
  input: Omit<AssembleSystemPromptInput, "mode">
): { sections: AssemblyPreviewSection[]; prompt: string; totalTokens: number } {
  const modeConfig = MODE_CONFIG[mode];
  const sections: AssemblyPreviewSection[] = [];
  let order = 1;

  const push = (section: Omit<AssemblyPreviewSection, "order">) => {
    sections.push({ ...section, order: order++ });
  };

  const baseText = modeConfig.basePrompt.trim();
  push({
    slotId: "base",
    label: "Base mode prompt",
    text: baseText,
    tokenEstimate: baseText ? countTokens(baseText) : 0,
    status: "active",
  });

  const includeWorkspace = mode !== "chat" || input.includeWorkspaceInChat;
  if (includeWorkspace) {
    const text = buildWorkspaceContextBlock(input.workspacePath).trim();
    push({
      slotId: "workspace",
      label: "Workspace context",
      text,
      tokenEstimate: text ? countTokens(text) : 0,
      status: "active",
    });
  } else {
    push({
      slotId: "workspace",
      label: "Workspace context",
      text: "",
      tokenEstimate: 0,
      status: "skipped",
      note:
        mode === "chat"
          ? "Omitted in chat mode. Turn on **Include workspace context in chat** under General settings to add it."
          : "No workspace folder open.",
    });
  }

  const toolsOn = modeConfig.tools.length > 0;
  if (toolsOn) {
    const toolInstr = buildToolUseInstruction({
      verbosity: input.modelSettings.promptVerbosity,
      parallelToolCalls: input.modelSettings.parallelToolCalls,
      textFallback: input.modelSettings.toolCallFormat === "text_fallback",
    }).trim();
    push({
      slotId: "tools",
      label: `Tool instructions (${input.modelSettings.promptVerbosity})`,
      text: toolInstr,
      tokenEstimate: toolInstr ? countTokens(toolInstr) : 0,
      status: "active",
    });
  } else {
    push({
      slotId: "tools",
      label: "Tool instructions",
      text: "",
      tokenEstimate: 0,
      status: "skipped",
      note: "Chat mode does not use tools — this block is not sent.",
    });
  }

  const skillBlocks = input.skillBlocks ?? [];
  if (skillBlocks.length > 0) {
    for (const skill of skillBlocks) {
      const text = skill.text.trim();
      push({
        slotId: `skill-${skill.id}`,
        label: skill.label,
        text,
        tokenEstimate: text ? countTokens(text) : 0,
        status: "active",
      });
    }
  } else {
    push({
      slotId: "skills",
      label: "Skills",
      text: "",
      tokenEstimate: 0,
      status: "placeholder",
      note: SKILLS_SLOT_NOTE,
    });
  }

  const userText = input.userPromptText.trim();
  if (userText) {
    push({
      slotId: "prompts",
      label: "System prompts",
      text: userText,
      tokenEstimate: countTokens(userText),
      status: "active",
    });
  } else {
    push({
      slotId: "prompts",
      label: "System prompts",
      text: "",
      tokenEstimate: 0,
      status: "placeholder",
      note: "No enabled system prompts apply to this mode. Manage them under System prompts.",
    });
  }

  if (toolsOn) {
    const summary = TOOL_SUMMARY_INSTRUCTION.trim();
    push({
      slotId: "summary",
      label: "Tool summary instruction",
      text: summary,
      tokenEstimate: summary ? countTokens(summary) : 0,
      status: "active",
    });
  } else {
    push({
      slotId: "summary",
      label: "Tool summary instruction",
      text: "",
      tokenEstimate: 0,
      status: "skipped",
      note: "Only appended in plan and agent modes after tool rounds.",
    });
  }

  const prompt = sections
    .filter((s) => s.status === "active" && s.text)
    .map((s) => s.text)
    .join("\n\n");

  const totalTokens = sections
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + s.tokenEstimate, 0);

  return { sections, prompt, totalTokens };
}

/** Single markdown document showing every injection slot (for preview UI). */
export function formatAssemblyPreviewDocument(
  mode: ChatMode,
  sections: AssemblyPreviewSection[],
  totalTokens: number
): string {
  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
  const lines: string[] = [
    `# Assembled system prompt — ${modeLabel} mode`,
    "",
    `**Estimated tokens sent to the model:** ${totalTokens.toLocaleString()}`,
    "",
    "Blocks below mirror the exact assembly order. Skipped or empty slots are shown so you can see where content would appear.",
    "",
  ];

  for (const section of sections) {
    lines.push("---");
    lines.push("");
    const tok =
      section.status === "active" && section.tokenEstimate > 0
        ? ` · ${section.tokenEstimate.toLocaleString()} tok`
        : "";
    lines.push(`## ${section.order}. ${section.label}${tok}`);

    if (section.status === "skipped") {
      lines.push("");
      lines.push(`*Skipped.* ${section.note ?? ""}`);
    } else if (section.status === "placeholder") {
      lines.push("");
      lines.push(`*Placeholder.* ${section.note ?? ""}`);
    } else if (section.note) {
      lines.push("");
      lines.push(`*${section.note}*`);
    }

    lines.push("");
    if (section.status === "active" && section.text) {
      lines.push(section.text);
    } else {
      lines.push("```");
      lines.push("(no content in this slot)");
      lines.push("```");
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
