import { countTokens } from "./chatContext";
import type { Message as ProviderMessage } from "./providers/openaiCompat";
import type { ChatBackend, ModelConfig } from "./stores/settings";
import { RECOMMENDED_OLLAMA_MODELS, pickContextOption } from "./ollamaClient";

/** Pi-style reserve for the model reply; scaled down for small local contexts. */
export const DEFAULT_RESERVE_TOKENS = 16_384;

export type ContextWindowSource = {
  chatBackend: ChatBackend;
  selectedModel: string;
  ollamaModels: ModelConfig[];
  llamacppModels: ModelConfig[];
  anthropicModels: ModelConfig[];
  deepseekModels: ModelConfig[];
  glmModels: ModelConfig[];
  kimiModels: ModelConfig[];
  anthropicContextBudget: number | null;
};

/** Effective context window for the active model (matches chat footer / `num_ctx`). */
export function resolveModelContextWindow(source: ContextWindowSource): number {
  if (source.chatBackend === "ollama") {
    const row = source.ollamaModels.find((m) => m.id === source.selectedModel);
    if (row?.contextWindow) return row.contextWindow;
    const rec = RECOMMENDED_OLLAMA_MODELS.find((r) => r.id === source.selectedModel);
    if (rec) {
      return pickContextOption(rec.contextWindow, rec.contextLimitMax ?? rec.contextWindow);
    }
    return 8192;
  }
  if (source.chatBackend === "llamacpp") {
    return (
      source.llamacppModels.find((m) => m.id === source.selectedModel)?.contextWindow ?? 8192
    );
  }
  if (source.chatBackend === "deepseek") {
    return (
      source.deepseekModels.find((m) => m.id === source.selectedModel && m.provider === "deepseek")
        ?.contextWindow ?? 65_536
    );
  }
  if (source.chatBackend === "glm") {
    return (
      source.glmModels.find((m) => m.id === source.selectedModel && m.provider === "glm")
        ?.contextWindow ?? 128_000
    );
  }
  if (source.chatBackend === "kimi") {
    return (
      source.kimiModels.find((m) => m.id === source.selectedModel && m.provider === "kimi")
        ?.contextWindow ?? 262_144
    );
  }
  const cap =
    source.anthropicModels.find((m) => m.id === source.selectedModel && m.provider === "anthropic")
      ?.contextWindow ?? 128_000;
  const budget = source.anthropicContextBudget;
  return budget != null ? Math.min(budget, cap) : cap;
}

/** Reserve tokens for the next model reply; never more than half the window. */
export function effectiveReserveTokens(contextWindow: number): number {
  const floor = Math.max(256, Math.floor(contextWindow * 0.12));
  if (contextWindow <= 4096) {
    return Math.min(floor, Math.floor(contextWindow * 0.25));
  }
  if (contextWindow <= 32_768) {
    return Math.min(4096, Math.floor(contextWindow * 0.2), DEFAULT_RESERVE_TOKENS);
  }
  return Math.min(DEFAULT_RESERVE_TOKENS, Math.floor(contextWindow * 0.125));
}

export function contextBudgetLimit(contextWindow: number): number {
  const reserve = effectiveReserveTokens(contextWindow);
  return Math.max(512, contextWindow - reserve);
}

export function estimateProviderMessagesTokens(messages: ProviderMessage[]): number {
  let n = 0;
  for (const m of messages) {
    n += 4;
    if (typeof m.content === "string") {
      n += countTokens(m.content);
    } else if (m.content != null) {
      n += countTokens(JSON.stringify(m.content));
    }
    if (m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        n += countTokens(tc.function.name);
        n += countTokens(tc.function.arguments);
      }
    }
    if (m.tool_call_id) n += countTokens(m.tool_call_id);
  }
  return n;
}

/** True when the next LLM call would exceed the model context budget (Pi: window − reserve). */
export function isAgentContextBudgetExceeded(
  messages: ProviderMessage[],
  contextWindow: number
): boolean {
  if (contextWindow <= 0) return false;
  const used = estimateProviderMessagesTokens(messages);
  return used >= contextBudgetLimit(contextWindow);
}

export type ContextUsageLevel = "healthy" | "warning" | "critical";

export function contextUsageLevel(used: number, budgetLimit: number): ContextUsageLevel {
  if (budgetLimit <= 0) return "healthy";
  const ratio = used / budgetLimit;
  if (ratio >= 0.9) return "critical";
  if (ratio >= 0.7) return "warning";
  return "healthy";
}

export function contextBudgetStopMessage(contextWindow: number, tokensUsed: number): string {
  const limit = contextBudgetLimit(contextWindow);
  return (
    `Stopped: context budget reached (~${tokensUsed.toLocaleString()} / ${limit.toLocaleString()} tokens for this model's ${contextWindow.toLocaleString()}-token window). ` +
    `Enable compaction in Settings → Compaction, start a new chat, or use a smaller context window.`
  );
}
