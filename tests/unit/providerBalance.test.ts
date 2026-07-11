import { describe, expect, it, vi } from "vitest";
import {
  formatBalanceAmount,
  fetchDeepseekAccountBalance,
} from "../../src/lib/providerBalance";

describe("providerBalance", () => {
  it("formats USD and CNY amounts", () => {
    expect(formatBalanceAmount(4.32, "USD")).toBe("$4.32");
    expect(formatBalanceAmount(8.66, "CNY")).toBe("¥8.66");
  });

  it("parses DeepSeek balance response", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          is_available: true,
          balance_infos: [
            {
              currency: "USD",
              total_balance: "12.50",
              granted_balance: "2.00",
              topped_up_balance: "10.50",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const balance = await fetchDeepseekAccountBalance("sk-test-key-1234567890");
    expect(balance).toEqual({
      provider: "deepseek",
      currency: "USD",
      totalBalance: 12.5,
      grantedBalance: 2,
      toppedUpBalance: 10.5,
      isAvailable: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/user/balance",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key-1234567890",
        }),
      })
    );

    vi.unstubAllGlobals();
  });
});
