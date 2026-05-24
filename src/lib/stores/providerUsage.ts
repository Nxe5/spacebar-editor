import { writable, get } from "svelte/store";

export type ProviderUsageTotals = {
  inputTokens: number;
  outputTokens: number;
};

type UsageState = {
  month: string;
  providers: Record<string, ProviderUsageTotals>;
};

const STORAGE_KEY = "tinyllama.providerUsage.v1";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function emptyTotals(): ProviderUsageTotals {
  return { inputTokens: 0, outputTokens: 0 };
}

function loadUsage(): UsageState {
  const month = currentMonthKey();
  if (typeof localStorage === "undefined") {
    return { month, providers: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { month, providers: {} };
    const parsed = JSON.parse(raw) as UsageState;
    if (parsed.month !== month) {
      return { month, providers: {} };
    }
    return {
      month,
      providers: parsed.providers ?? {},
    };
  } catch {
    return { month, providers: {} };
  }
}

function createProviderUsageStore() {
  const { subscribe, set, update } = writable<UsageState>(loadUsage());

  subscribe((state) => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota */
    }
  });

  return {
    subscribe,
    record(providerId: string, inputTokens: number, outputTokens: number) {
      if (inputTokens <= 0 && outputTokens <= 0) return;
      const month = currentMonthKey();
      update((state) => {
        const base =
          state.month === month ? state : { month, providers: {} as Record<string, ProviderUsageTotals> };
        const prev = base.providers[providerId] ?? emptyTotals();
        return {
          month,
          providers: {
            ...base.providers,
            [providerId]: {
              inputTokens: prev.inputTokens + Math.max(0, inputTokens),
              outputTokens: prev.outputTokens + Math.max(0, outputTokens),
            },
          },
        };
      });
    },
    getMonthly(providerId: string): ProviderUsageTotals {
      const state = get({ subscribe });
      if (state.month !== currentMonthKey()) return emptyTotals();
      return state.providers[providerId] ?? emptyTotals();
    },
    resetForTests() {
      set({ month: currentMonthKey(), providers: {} });
    },
  };
}

export const providerUsage = createProviderUsageStore();
