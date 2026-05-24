import type { ChatBackend } from "./stores/settings";

export type ChatFooterProfile = {
  /** Show tok/s · output tok · duration for the last reply. */
  showStreamMetrics: boolean;
  showContextBar: boolean;
  /** Allow changing context window / budget from the footer menu. */
  contextBudgetEditable: boolean;
  /** Suffix on context label, e.g. "server" for llama.cpp. */
  contextHint?: string;
  /** Show rolling monthly input/output token totals (API providers). */
  showMonthlyUsage: boolean;
  usageProviderId: string;
};

const FOOTER_PROFILES: Record<ChatBackend, ChatFooterProfile> = {
  ollama: {
    showStreamMetrics: true,
    showContextBar: true,
    contextBudgetEditable: true,
    showMonthlyUsage: false,
    usageProviderId: "ollama",
  },
  llamacpp: {
    showStreamMetrics: true,
    showContextBar: true,
    contextBudgetEditable: false,
    contextHint: "server",
    showMonthlyUsage: false,
    usageProviderId: "llamacpp",
  },
  anthropic: {
    showStreamMetrics: false,
    showContextBar: true,
    contextBudgetEditable: false,
    showMonthlyUsage: true,
    usageProviderId: "anthropic",
  },
};

export function chatFooterProfile(backend: ChatBackend): ChatFooterProfile {
  return FOOTER_PROFILES[backend];
}

export function formatMonthlyUsageLabel(inputTokens: number, outputTokens: number): string {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  };
  return `${fmt(inputTokens)} in · ${fmt(outputTokens)} out this month`;
}

export function contextBudgetTitle(profile: ChatFooterProfile, backend: ChatBackend): string {
  if (profile.contextBudgetEditable) {
    return "Change context window for this model";
  }
  if (backend === "llamacpp") {
    return "Context size is fixed in llama.cpp server config — change it there and restart";
  }
  if (backend === "anthropic") {
    return "Estimated chat size vs model context limit";
  }
  return "Estimated context for this chat";
}
