import { chatHasMessagesForCompaction, shouldAutoCompact } from "../agentCompaction";
import { estimateProviderMessagesTokens } from "../contextBudget";
import type { Message as ProviderMessage } from "../providers/openaiCompat";
import type { Message } from "../stores/chat";
import type { SettingsState } from "../stores/settings";
import { buildCompactedMessages, runCompactionSummary } from "./compactHistory";

export async function compactChatSession(options: {
  settings: SettingsState;
  messages: Message[];
  keepRecent: number;
  thresholdPercent: number;
  planContent?: string | null;
  signal?: AbortSignal;
}): Promise<Message[]> {
  if (!chatHasMessagesForCompaction(options.messages.length, options.keepRecent)) {
    throw new Error("Not enough history to compact — send a few more messages first.");
  }

  const summary = await runCompactionSummary({
    settings: options.settings,
    messages: options.messages,
    thresholdPercent: options.thresholdPercent,
    planContent: options.planContent,
    signal: options.signal,
  });

  return buildCompactedMessages(summary, options.messages, options.keepRecent);
}

export async function maybeAutoCompactBeforeTurn(options: {
  settings: SettingsState;
  messages: Message[];
  providerMessages: ProviderMessage[];
  contextWindow: number;
  signal?: AbortSignal;
}): Promise<Message[] | null> {
  const { agentCompaction } = options.settings;
  if (!agentCompaction.enabled) return null;
  const keepRecent = agentCompaction.compactKeepRecentTurns;
  if (!agentCompaction.autoCompact) return null;
  if (!chatHasMessagesForCompaction(options.messages.length, keepRecent)) return null;

  const used = estimateProviderMessagesTokens(options.providerMessages);
  if (!shouldAutoCompact(used, options.contextWindow, agentCompaction.compactThreshold)) {
    return null;
  }

  const thresholdPercent = Math.min(
    100,
    Math.round((used / options.contextWindow) * 100)
  );

  return compactChatSession({
    settings: options.settings,
    messages: options.messages,
    keepRecent,
    thresholdPercent: thresholdPercent || 85,
    signal: options.signal,
  });
}
