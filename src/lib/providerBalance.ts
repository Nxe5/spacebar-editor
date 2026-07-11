/** Account balance for cloud API providers (where exposed). */

import { DEEPSEEK_API_BASE } from "./providers/deepseek";

export type BalanceCurrency = "USD" | "CNY";

export type ProviderAccountBalance = {
  provider: "deepseek";
  currency: BalanceCurrency;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
  isAvailable: boolean;
};

type DeepseekBalanceRow = {
  currency?: string;
  total_balance?: string;
  granted_balance?: string;
  topped_up_balance?: string;
};

type DeepseekBalanceResponse = {
  is_available?: boolean;
  balance_infos?: DeepseekBalanceRow[];
};

function parseAmount(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : 0;
}

function normalizeCurrency(raw: string | undefined): BalanceCurrency {
  return raw?.toUpperCase() === "CNY" ? "CNY" : "USD";
}

function pickBalanceRow(rows: DeepseekBalanceRow[]): DeepseekBalanceRow | null {
  if (rows.length === 0) return null;
  return rows.find((r) => r.currency?.toUpperCase() === "USD") ?? rows[0] ?? null;
}

/** DeepSeek: GET /user/balance (see https://api-docs.deepseek.com/api/get-user-balance). */
export async function fetchDeepseekAccountBalance(apiKey: string): Promise<ProviderAccountBalance> {
  const key = apiKey.trim();
  if (key.length < 10) {
    throw new Error("DeepSeek API key is missing or too short");
  }

  const res = await fetch(`${DEEPSEEK_API_BASE}/user/balance`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek balance API ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }

  const body = (await res.json()) as DeepseekBalanceResponse;
  const row = pickBalanceRow(body.balance_infos ?? []);
  if (!row) {
    throw new Error("DeepSeek balance response had no currency rows");
  }

  return {
    provider: "deepseek",
    currency: normalizeCurrency(row.currency),
    totalBalance: parseAmount(row.total_balance),
    grantedBalance: parseAmount(row.granted_balance),
    toppedUpBalance: parseAmount(row.topped_up_balance),
    isAvailable: body.is_available !== false,
  };
}

export function formatBalanceAmount(amount: number, currency: BalanceCurrency): string {
  const symbol = currency === "CNY" ? "¥" : "$";
  if (amount >= 100) return `${symbol}${amount.toFixed(2)}`;
  if (amount >= 10) return `${symbol}${amount.toFixed(2)}`;
  return `${symbol}${amount.toFixed(2)}`;
}
