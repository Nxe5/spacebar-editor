/** Account balance for cloud API providers (where exposed). */

import { DEEPSEEK_API_BASE } from "./providers/deepseek";
import { KIMI_API_BASE } from "./providers/kimi";

export type BalanceCurrency = "USD" | "CNY";

export type ProviderAccountBalance = {
  provider: "deepseek" | "kimi";
  currency: BalanceCurrency;
  /** Spendable balance (DeepSeek: total; Kimi: available). */
  totalBalance: number;
  grantedBalance?: number;
  toppedUpBalance?: number;
  voucherBalance?: number;
  cashBalance?: number;
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

type KimiBalanceResponse = {
  code?: number;
  status?: boolean;
  data?: {
    available_balance?: number;
    voucher_balance?: number;
    cash_balance?: number;
  };
  error?: { message?: string };
};

/** Kimi / Moonshot: GET /v1/users/me/balance (see https://platform.kimi.ai/docs/api/balance). */
export async function fetchKimiAccountBalance(apiKey: string): Promise<ProviderAccountBalance> {
  const key = apiKey.trim();
  if (key.length < 10) {
    throw new Error("Kimi API key is missing or too short");
  }

  const res = await fetch(`${KIMI_API_BASE}/v1/users/me/balance`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kimi balance API ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }

  const body = (await res.json()) as KimiBalanceResponse;
  if (body.code !== 0 || body.status === false || !body.data) {
    throw new Error(body.error?.message ?? "Kimi balance response was not successful");
  }

  const available = body.data.available_balance ?? 0;
  return {
    provider: "kimi",
    currency: "USD",
    totalBalance: available,
    voucherBalance: body.data.voucher_balance ?? 0,
    cashBalance: body.data.cash_balance ?? 0,
    isAvailable: available > 0,
  };
}

export async function fetchAccountBalance(
  provider: "deepseek" | "kimi",
  apiKey: string
): Promise<ProviderAccountBalance> {
  if (provider === "deepseek") return fetchDeepseekAccountBalance(apiKey);
  return fetchKimiAccountBalance(apiKey);
}

export function formatBalanceAmount(amount: number, currency: BalanceCurrency): string {
  const symbol = currency === "CNY" ? "¥" : "$";
  if (amount >= 100) return `${symbol}${amount.toFixed(2)}`;
  if (amount >= 10) return `${symbol}${amount.toFixed(2)}`;
  return `${symbol}${amount.toFixed(2)}`;
}
