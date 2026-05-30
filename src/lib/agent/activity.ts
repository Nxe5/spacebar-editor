import { formatToolSummary } from "./toolDisplay";
import {
  pickStreamingStatusWord,
  stableStreamingStatusWord,
} from "./streamingStatusWord";
import { SELF_EXPLANATORY_MUTATION_TOOLS } from "./synthesis";

export type ToolActivityStatus = "pending" | "running" | "done" | "error";

export type ToolActivityItem = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolActivityStatus;
  content?: string;
  success?: boolean;
  paths?: string[];
};

export type AgentTurnBlock = {
  kind: "agent-turn";
  /** Stable id for expand-state (first assistant message id in block). */
  id: string;
  /** Whimsical status label picked once for this turn (e.g. "Deliberating"). */
  statusLabel: string;
  thinking: string;
  planText: string;
  tools: ToolActivityItem[];
  response: string;
  /** Index after this block in the messages array. */
  endIndex: number;
};

const TOOL_LABELS: Record<string, string> = {
  read_file: "Read",
  write_file: "Write",
  create_file: "Create",
  delete_file: "Delete",
  move_file: "Move",
  list_dir: "Listed",
  grep: "Grepped",
  find_file: "Searched",
  get_file_tree: "Tree",
  get_git_status: "Git status",
  get_git_diff: "Git diff",
  get_git_log: "Git log",
  run_shell: "Shell",
  run_script: "Script",
  run_tests: "Tests",
  web_fetch: "Fetched",
};

export function toolActivityLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

export function formatToolActivityLine(
  toolName: string,
  input: Record<string, unknown>
): string {
  const label = toolActivityLabel(toolName);
  const detail = formatToolSummary(toolName, input);
  return detail ? `${label}  ${detail}` : label;
}

/** One-line preview for collapsed thought / plan rows in the activity feed. */
export function formatThoughtPreview(text: string, maxLen = 72): string {
  const oneLine = text.trim().replace(/\s+/g, " ");
  if (!oneLine) return "";
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

export function parseToolInput(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

type ChatLikeMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  activityLabel?: string;
  thinking?: string;
  rawToolCalls?: { id: string; name: string; arguments: string }[];
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolSuccess?: boolean;
  toolPaths?: string[];
  toolCallId?: string;
  /** Marks the synthetic summary message produced by context compaction (spec 21 §7.3). */
  compactionBoundary?: boolean;
};

function mergeToolItem(existing: ToolActivityItem, next: Partial<ToolActivityItem>): ToolActivityItem {
  return {
    ...existing,
    ...next,
    input: next.input && Object.keys(next.input).length > 0 ? next.input : existing.input,
    status: next.status ?? existing.status,
  };
}

function upsertToolList(list: ToolActivityItem[], item: ToolActivityItem): ToolActivityItem[] {
  const idx = list.findIndex((t) => t.id === item.id);
  if (idx < 0) return [...list, item];
  const copy = [...list];
  copy[idx] = mergeToolItem(copy[idx], item);
  return copy;
}

/** Group one user message's agent work into a Cursor-style activity block. */
export function groupAgentTurns(messages: ChatLikeMessage[]): Array<
  | { kind: "user"; message: ChatLikeMessage }
  | AgentTurnBlock
> {
  const out: Array<{ kind: "user"; message: ChatLikeMessage } | AgentTurnBlock> = [];
  let i = 0;

  while (i < messages.length) {
    const m = messages[i];
    if (m.role === "user") {
      out.push({ kind: "user", message: m });
      i++;
      continue;
    }

    if (m.role === "assistant" || m.role === "tool") {
      const block = collectAgentTurn(messages, i);
      out.push(block);
      i = block.endIndex;
      continue;
    }

    i++;
  }

  return out;
}

/** While a turn is streaming, the live overlay owns the in-progress agent block. */
export function groupAgentTurnsForDisplay(
  messages: ChatLikeMessage[],
  streaming: boolean,
  liveTurnActive: boolean
): Array<{ kind: "user"; message: ChatLikeMessage } | AgentTurnBlock> {
  const blocks = groupAgentTurns(messages);
  if (!streaming || !liveTurnActive || blocks.length === 0) return blocks;
  const last = blocks[blocks.length - 1];
  if (last.kind === "agent-turn") return blocks.slice(0, -1);
  return blocks;
}

function isFinalAssistant(messages: ChatLikeMessage[], index: number): boolean {
  const m = messages[index];
  if (m.role !== "assistant" || !m.content.trim()) return false;
  if (m.rawToolCalls?.length) return false;
  return index + 1 >= messages.length || messages[index + 1]?.role !== "tool";
}

function collectAgentTurn(messages: ChatLikeMessage[], start: number): AgentTurnBlock {
  const thinkingParts: string[] = [];
  const planParts: string[] = [];
  let tools: ToolActivityItem[] = [];
  let response = "";
  let id = messages[start]?.id ?? crypto.randomUUID();
  let statusLabel = "";
  let i = start;
  let sawToolWork = false;

  while (i < messages.length) {
    const m = messages[i];
    if (m.role === "user") break;

    if (m.role === "tool") {
      sawToolWork = true;
      tools = upsertToolList(tools, {
        id: m.toolCallId ?? m.id,
        name: m.toolName ?? "tool",
        input: m.toolInput ?? {},
        status: m.toolSuccess === false ? "error" : "done",
        content: m.content,
        success: m.toolSuccess,
        paths: m.toolPaths,
      });
      i++;
      continue;
    }

    if (m.role === "assistant") {
      if (i === start) id = m.id;
      if (m.activityLabel?.trim() && !statusLabel) statusLabel = m.activityLabel.trim();
      if (m.thinking?.trim()) thinkingParts.push(m.thinking.trim());

      if (isFinalAssistant(messages, i)) {
        if (sawToolWork || tools.length > 0) {
          response = m.content.trim();
          i++;
          break;
        }
        response = m.content.trim();
        i++;
        break;
      }

      if (m.content.trim()) {
        planParts.push(m.content.trim());
      }

      if (m.rawToolCalls?.length) {
        sawToolWork = true;
        for (const tc of m.rawToolCalls) {
          tools = upsertToolList(tools, {
            id: tc.id,
            name: tc.name,
            input: parseToolInput(tc.arguments),
            status: "pending",
          });
        }
      }

      i++;
      continue;
    }

    i++;
  }

  const thinking = thinkingParts.join("\n\n");
  return {
    kind: "agent-turn",
    id,
    statusLabel:
      statusLabel || (thinking ? stableStreamingStatusWord(id) : pickStreamingStatusWord()),
    thinking,
    planText: planParts.join("\n\n"),
    tools,
    response,
    endIndex: i,
  };
}

/** One-line label for a collapsed agent turn row in the chat pane. */
export function formatAgentTurnCollapsedSummary(turn: AgentTurnBlock): string {
  const meta: string[] = [];
  if (turn.tools.length > 0) {
    const failed = turn.tools.some(
      (t) => t.status === "error" || t.success === false
    );
    const n = turn.tools.length;
    meta.push(failed ? `${n} tool${n === 1 ? "" : "s"} · errors` : `${n} tool${n === 1 ? "" : "s"}`);
  }
  if (turn.thinking.trim()) meta.push("reasoning");

  let primary = "";
  if (turn.response.trim() && !isRedundantToolTurnResponse(turn)) {
    primary = formatThoughtPreview(turn.response, 96);
  } else if (turn.tools.length > 0) {
    const last = turn.tools[turn.tools.length - 1]!;
    primary = formatToolActivityLine(last.name, last.input);
  } else if (turn.planText.trim()) {
    primary = formatThoughtPreview(turn.planText, 96);
  } else if (turn.thinking.trim()) {
    primary = formatThoughtPreview(turn.thinking, 96);
  } else {
    primary = turn.statusLabel || "Agent reply";
  }

  return meta.length > 0 ? `${primary} · ${meta.join(", ")}` : primary;
}

/** Hide the gray response bubble when successful file tools already tell the story. */
export function isRedundantToolTurnResponse(turn: AgentTurnBlock): boolean {
  if (!turn.response.trim() || turn.tools.length === 0) return false;
  if (turn.tools.some((t) => t.status === "error" || t.success === false)) return false;
  return turn.tools.every((t) => SELF_EXPLANATORY_MUTATION_TOOLS.has(t.name));
}

export function createLiveTurn(): AgentTurnBlock {
  const id = crypto.randomUUID();
  return {
    kind: "agent-turn",
    id,
    statusLabel: pickStreamingStatusWord(),
    thinking: "",
    planText: "",
    tools: [],
    response: "",
    endIndex: 0,
  };
}

export function upsertLiveTool(
  turn: AgentTurnBlock,
  item: ToolActivityItem | (Partial<ToolActivityItem> & { id: string })
): AgentTurnBlock {
  const existing = turn.tools.find((t) => t.id === item.id);
  const merged: ToolActivityItem = existing
    ? mergeToolItem(existing, item)
    : {
        id: item.id,
        name: item.name ?? "tool",
        input: item.input ?? {},
        status: item.status ?? "pending",
        content: item.content,
        success: item.success,
        paths: item.paths,
      };
  return { ...turn, tools: upsertToolList(turn.tools, merged) };
}
