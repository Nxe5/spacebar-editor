import type { Message } from "../stores/chat";
import type { SettingsState } from "../stores/settings";
import { streamOneTurn, resolveStreamCredentials } from "./streamTurn";
import {
  assertCompactionCredentials,
  resolveCompactionTarget,
} from "../compactionModel";
import { inferenceOptionsForModel } from "../inferenceOptions";

export const COMPACTION_ACK = "Understood. Continuing from the compacted context.";

export const COMPACTION_SYSTEM_PROMPT =
  "You compress long coding session transcripts into structured summaries. Follow the requested format exactly.";

export function sliceMessagesForCompactionPrompt(messages: Message[]): Message[] {
  if (!messages.length) return [];
  const firstUserIdx = messages.findIndex((m) => m.role === "user");
  const first = firstUserIdx >= 0 ? messages[firstUserIdx] : messages[0];
  const tail = messages.slice(-20);
  const seen = new Set<string>();
  const out: Message[] = [];
  for (const m of [first, ...tail]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

function formatMessageLine(msg: Message): string {
  if (msg.role === "user") return `[user]\n${msg.content}`;
  if (msg.role === "assistant") {
    const thinking = msg.thinking?.trim() ? `\n(thinking: ${msg.thinking.trim()})` : "";
    const tools =
      msg.rawToolCalls?.length ?
        `\n(tool calls: ${msg.rawToolCalls.map((t) => t.name).join(", ")})`
      : "";
    return `[assistant]\n${msg.content}${thinking}${tools}`;
  }
  const name = msg.toolName ?? "tool";
  return `[tool:${name}]\n${msg.content}`;
}

export function formatMessagesForCompactionPrompt(messages: Message[]): string {
  return messages.map(formatMessageLine).join("\n\n");
}

export function buildCompactionUserPrompt(
  messages: Message[],
  thresholdPercent: number,
  planContent: string | null
): string {
  const transcript = formatMessagesForCompactionPrompt(messages);
  const planBlock =
    planContent?.trim() ?
      `\n\nActive plan file contents:\n\`\`\`\n${planContent.trim()}\n\`\`\``
    : "";

  return `
You are compacting a coding session to free context space.
The session was compacted at ${thresholdPercent}% of the model context window.

Produce a structured summary following this exact markdown format:

## Session Context (compacted at ${thresholdPercent}% context)

### Original Task
<The user's original goal in 1-3 sentences — verbatim or close paraphrase>

### Active Plan
<Open tasks verbatim from the plan file + status, or write "No active plan." if none exists>

### What Was Done
<Bullet list of concrete actions: files created/modified, commands run, decisions made>

### Current State
<1-2 sentences: what is actively in progress and any critical context>

### Files Modified This Session
<Bullet list of file paths touched, one per line>

Session transcript (partial — first user turn and last 20 messages):
${transcript}${planBlock}
`.trim();
}

export function buildCompactedMessages(
  summary: string,
  priorMessages: Message[],
  keepRecent: number
): Message[] {
  const recent = priorMessages.slice(-keepRecent);
  const now = Date.now();
  const userMsg: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content: `[Session context — compacted to free space]\n\n${summary.trim()}`,
    timestamp: now,
    compactionBoundary: true,
  };
  const assistantMsg: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: COMPACTION_ACK,
    timestamp: now + 1,
  };
  return [userMsg, assistantMsg, ...recent];
}

export async function runCompactionSummary(options: {
  settings: SettingsState;
  messages: Message[];
  thresholdPercent: number;
  planContent?: string | null;
  signal?: AbortSignal;
}): Promise<string> {
  const slice = sliceMessagesForCompactionPrompt(options.messages);
  if (!slice.length) {
    throw new Error("No messages available to summarize.");
  }

  const target = resolveCompactionTarget(options.settings);
  assertCompactionCredentials(options.settings, target.backend);

  const creds = resolveStreamCredentials({
    backend: target.backend,
    apiKeys: options.settings.apiKeys,
    ollamaEndpoint: options.settings.ollamaEndpoint,
    ollamaApiKey: options.settings.ollamaApiKey,
    llamacppEndpoint: options.settings.llamacppEndpoint,
    llamacppApiKey: options.settings.llamacppApiKey,
  });

  const userPrompt = buildCompactionUserPrompt(
    slice,
    options.thresholdPercent,
    options.planContent ?? null
  );

  const result = await streamOneTurn({
    backend: target.backend,
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl,
    model: target.modelId,
    systemPrompt: COMPACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    signal: options.signal,
    inferenceOptions: inferenceOptionsForModel(
      options.settings,
      target.backend,
      target.modelId
    ),
  });

  const summary = result.content.trim();
  if (!summary) {
    throw new Error("Compaction model returned an empty summary.");
  }
  return summary;
}
