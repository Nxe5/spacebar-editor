import type { ChatBackend } from "./stores/settings";
import type { BalanceCurrency, ProviderAccountBalance } from "./providerBalance";
import { formatBalanceAmount } from "./providerBalance";

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
    showStreamMetrics: true,
    showContextBar: true,
    contextBudgetEditable: false,
    showMonthlyUsage: true,
    usageProviderId: "anthropic",
  },
  deepseek: {
    showStreamMetrics: true,
    showContextBar: true,
    contextBudgetEditable: false,
    showMonthlyUsage: true,
    usageProviderId: "deepseek",
  },
  glm: {
    showStreamMetrics: true,
    showContextBar: true,
    contextBudgetEditable: false,
    showMonthlyUsage: true,
    usageProviderId: "glm",
  },
  kimi: {
    showStreamMetrics: true,
    showContextBar: true,
    contextBudgetEditable: false,
    showMonthlyUsage: true,
    usageProviderId: "kimi",
  },
};

export function chatFooterProfile(backend: ChatBackend): ChatFooterProfile {
  return FOOTER_PROFILES[backend];
}

export type FooterUsageView = "tokens" | "balance";

export function formatCompactTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function formatMonthlyUsageLabel(inputTokens: number, outputTokens: number): string {
  const month = new Date().toLocaleString(undefined, { month: "short" });
  return `${month}: ${formatCompactTokenCount(inputTokens)} in · ${formatCompactTokenCount(outputTokens)} out`;
}

/** Balance footer row — remaining account credit only. */
export function formatFooterBalanceLabel(
  balance: ProviderAccountBalance | null,
  backend: "anthropic" | "deepseek" | "glm" | "kimi",
  balanceError?: string | null
): string {
  if (balanceError === "loading") return "…";
  if (balance) {
    const remaining = formatBalanceAmount(balance.totalBalance, balance.currency);
    if (!balance.isAvailable && balance.totalBalance > 0) {
      return `${remaining} remaining (unavailable)`;
    }
    return `${remaining} remaining`;
  }
  if (balanceError) return "—";
  if (backend === "anthropic") return "—";
  return "—";
}

export function footerUsageToggleTitle(
  view: FooterUsageView,
  backend: "anthropic" | "deepseek" | "glm" | "kimi"
): string {
  if (view === "tokens") {
    return backend === "deepseek"
      ? "Click to show account balance remaining"
      : "Click to show account balance remaining · balance not available via API";
  }
  if (backend === "deepseek") {
    return "Click to show monthly token usage";
  }
  return "Click to show monthly token usage · balance not available via API";
}

export function cloudContextBudgetTitle(contextMax: number, backend?: ChatBackend): string {
  const balanceNote =
    backend === "deepseek"
      ? "Click monthly usage in the footer to see account balance remaining."
      : "Providers do not expose remaining account balance in the API — check your dashboard for billing.";
  return (
    `Estimated tokens in this chat vs the model limit (~${contextMax.toLocaleString()}). ${balanceNote}`
  );
}

export function contextBudgetTitle(profile: ChatFooterProfile, backend: ChatBackend): string {
  if (profile.contextBudgetEditable) {
    return "Change context window for this model";
  }
  if (backend === "llamacpp") {
    return "Context size is fixed in llama.cpp server config — change it there and restart";
  }
  if (backend === "anthropic" || backend === "deepseek" || backend === "glm" || backend === "kimi") {
    return "Estimated chat size vs model context limit";
  }
  return "Estimated context for this chat";
}
