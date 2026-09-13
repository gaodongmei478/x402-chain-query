/**
 * Tiny buyer smoke script:
 * - wrapFetchWithPayment + ExactEvmScheme
 * - spendControls.maxAmountPerPayment = "$1"
 * - in-process daily $20 spend guard
 * - allowlist only localhost / 127.0.0.1
 */
import { wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const DAILY_LIMIT_USD = 20;
const MAX_PER_PAYMENT = "$1";

/** Rough parse of "$0.01" / "0.01" → number of USD */
function parseUsdAmount(price: string | undefined): number {
  if (!price) return 0;
  const cleaned = price.replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function assertLocalhostAllowlist(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
    throw new Error(
      `Buyer allowlist blocked host "${host}". Only localhost / 127.0.0.1 are allowed.`,
    );
  }
}

type DailySpendState = {
  dayKey: string; // YYYY-MM-DD UTC
  spentUsd: number;
};

const dailySpend: DailySpendState = {
  dayKey: new Date().toISOString().slice(0, 10),
  spentUsd: 0,
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function recordAndGuardDailySpend(usd: number): void {
  const key = todayKey();
  if (dailySpend.dayKey !== key) {
    dailySpend.dayKey = key;
    dailySpend.spentUsd = 0;
  }
  if (dailySpend.spentUsd + usd > DAILY_LIMIT_USD) {
    throw new Error(
      `Daily spend guard: refusing +$${usd.toFixed(4)} ` +
        `(already $${dailySpend.spentUsd.toFixed(4)} / $${DAILY_LIMIT_USD} today UTC)`,
    );
  }
  dailySpend.spentUsd += usd;
  console.log(
    `[spend] +$${usd.toFixed(4)} → daily $${dailySpend.spentUsd.toFixed(4)} / $${DAILY_LIMIT_USD}`,
  );
}

async function main() {
  const pk = process.env.EVM_PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x")) {
    throw new Error(
      "Set EVM_PRIVATE_KEY=0x... in the environment (see .env.example).",
    );
  }

  const sellerUrl = (process.env.SELLER_URL ?? "http://127.0.0.1:4021").replace(
    /\/$/,
    "",
  );
  assertLocalhostAllowlist(sellerUrl);

  const queryAddress =
    process.env.QUERY_ADDRESS ??
    "0xc8aaea11c93a438e2fc7bd5cddb9a6936ed3595c";

  const signer = privateKeyToAccount(pk as `0x${string}`);
  console.log(`[buyer] address=${signer.address}`);
  console.log(`[buyer] seller=${sellerUrl}`);
  console.log(
    `[buyer] spendControls.maxAmountPerPayment=${MAX_PER_PAYMENT}; dailyLimit=$${DAILY_LIMIT_USD}`,
  );

  const client = x402Client.fromConfig({
    schemes: [{ network: "eip155:*", client: new ExactEvmScheme(signer) }],
    spendControls: {
      maxAmountPerPayment: MAX_PER_PAYMENT,
    },
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  async function paidGet(path: string, assumedPriceUsd: number) {
    const url = `${sellerUrl}${path}`;
    assertLocalhostAllowlist(url);
    recordAndGuardDailySpend(assumedPriceUsd);

    console.log(`\n→ GET ${url}`);
    const response = await fetchWithPayment(url, { method: "GET" });
    const result = await httpClient.processResponse(response);
    console.log(
      `  status=${response.status} paymentStatus=${result.paymentStatus}`,
    );
    console.log("  body:", result.body);
    if (result.paymentStatus === "settle_failed") {
      console.error("  settle failed header:", result.header);
    }
    return result;
  }

  // Pre-flight unpaid curl-equivalent (should be 402)
  {
    const probe = `${sellerUrl}/gas`;
    assertLocalhostAllowlist(probe);
    const res = await fetch(probe);
    console.log(`\n[probe unpaid] GET /gas → ${res.status}`);
    if (res.status === 402) {
      const pr =
        res.headers.get("PAYMENT-REQUIRED") ??
        res.headers.get("payment-required");
      console.log(
        `  PAYMENT-REQUIRED present: ${Boolean(pr)} (len=${pr?.length ?? 0})`,
      );
    }
  }

  await paidGet("/gas", parseUsdAmount("$0.01"));
  await paidGet(
    `/balance?address=${encodeURIComponent(queryAddress)}`,
    parseUsdAmount("$0.01"),
  );

  console.log("\n[buyer] smoke complete");
}

main().catch((err) => {
  console.error("[buyer] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
