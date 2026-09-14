import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  paymentMiddlewareFromHTTPServer,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { createPublicClient, formatEther, http, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { isAddress } from "viem";

type Env = {
  PAY_TO: string;
  NETWORK: string;
  BASE_RPC_URL: string;
  FACILITATOR_URL: string;
  PRICE_BALANCE: string;
  PRICE_GAS: string;
  FREE_TRIAL_LIMIT: string;
  CDP_API_KEY_ID?: string;
  CDP_API_KEY_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "PAYMENT-SIGNATURE", "X-PAYMENT", "x-wallet-address"],
    exposeHeaders: ["PAYMENT-RESPONSE", "PAYMENT-REQUIRED"],
  }),
);

const trials = new Map<string, number>();

function trialKey(c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }) {
  return (
    c.req.header("x-wallet-address") ||
    c.req.query("payer") ||
    c.req.header("cf-connecting-ip") ||
    "anon"
  ).toLowerCase();
}

function consumeTrial(key: string, limit: number): boolean {
  const used = trials.get(key) ?? 0;
  if (used >= limit) return false;
  trials.set(key, used + 1);
  return true;
}

function rpc(env: Env) {
  return createPublicClient({ chain: base, transport: http(env.BASE_RPC_URL) });
}

app.get("/health", (c) =>
  c.json({
    ok: true,
    network: c.env.NETWORK,
    payTo: c.env.PAY_TO,
    facilitator: c.env.FACILITATOR_URL,
    routes: { "/balance": c.env.PRICE_BALANCE, "/gas": c.env.PRICE_GAS },
    runtime: "cloudflare-workers",
  }),
);

async function createWorkerFacilitator(env: Env): Promise<HTTPFacilitatorClient> {
  const apiKeyId = env.CDP_API_KEY_ID;
  const apiKeySecret = env.CDP_API_KEY_SECRET;
  if (apiKeyId && apiKeySecret) {
    const { createCdpFacilitatorClient } = await import("@coinbase/cdp-sdk/x402");
    return createCdpFacilitatorClient({
      apiKeyId,
      apiKeySecret,
      baseUrl: env.FACILITATOR_URL,
    }) as unknown as HTTPFacilitatorClient;
  }
  // Without CDP keys: 402 challenge still works; verify/settle will fail.
  return new HTTPFacilitatorClient({ url: env.FACILITATOR_URL });
}

app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/health") return next();

  const facilitator = await createWorkerFacilitator(c.env);
  const network = "eip155:8453" as const;
  const resourceServer = new x402ResourceServer(facilitator).register(
    network,
    new ExactEvmScheme(),
  );

  const routes = {
    "GET /balance": {
      accepts: [
        {
          scheme: "exact" as const,
          price: c.env.PRICE_BALANCE,
          network: "eip155:8453" as const,
          payTo: c.env.PAY_TO,
        },
      ],
      description: "Base ETH balance",
      mimeType: "application/json",
      extensions: {
        ...declareDiscoveryExtension({
          input: { address: c.env.PAY_TO },
          inputSchema: {
            properties: { address: { type: "string" } },
            required: ["address"],
          },
        }),
      },
    },
    "GET /gas": {
      accepts: [
        {
          scheme: "exact" as const,
          price: c.env.PRICE_GAS,
          network: "eip155:8453" as const,
          payTo: c.env.PAY_TO,
        },
      ],
      description: "Base gas / EIP-1559 fees",
      mimeType: "application/json",
      extensions: {
        ...declareDiscoveryExtension({ input: {}, inputSchema: { properties: {} } }),
      },
    },
  };

  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  const limit = Number(c.env.FREE_TRIAL_LIMIT ?? "10");
  httpServer.onProtectedRequest(async () => {
    if (consumeTrial(trialKey(c), limit)) return { grantAccess: true };
    return;
  });

  const mw = paymentMiddlewareFromHTTPServer(httpServer);
  return mw(c, next);
});

app.get("/balance", async (c) => {
  const address = c.req.query("address") ?? "";
  if (!isAddress(address)) {
    return c.json({ error: "Missing or invalid ?address=0x..." }, 400);
  }
  const client = rpc(c.env);
  const wei = await client.getBalance({ address: address as Address });
  const asOf = new Date().toISOString();
  const raw = wei.toString();
  const formatted = formatEther(wei);
  return c.json({
    address,
    chainId: 8453,
    token: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    decimals: 18,
    balance: raw,
    balanceFormatted: formatted,
    asOf,
    wei: raw,
    ether: formatted,
    network: c.env.NETWORK,
  });
});

app.get("/gas", async (c) => {
  const client = rpc(c.env);
  const asOf = new Date().toISOString();
  const block = await client.getBlock({ blockTag: "latest" });
  const gasPrice = await client.getGasPrice();
  const tip = await client.estimateMaxPriorityFeePerGas().catch(() => 1_000_000n);
  const baseFee = block.baseFeePerGas ?? null;
  const maxFee = baseFee !== null ? baseFee * 2n + tip : gasPrice + tip;
  const gwei = Number(gasPrice) / 1e9;
  let urgency: "slow" | "standard" | "fast" = "standard";
  if (gwei < 0.01) urgency = "slow";
  else if (gwei > 0.1) urgency = "fast";
  const gasPriceWei = gasPrice.toString();
  return c.json({
    chainId: 8453,
    baseFeePerGas: baseFee !== null ? baseFee.toString() : null,
    maxPriorityFeePerGas: tip.toString(),
    maxFeePerGas: maxFee.toString(),
    gasPrice: gasPriceWei,
    urgency,
    asOf,
    gasPriceWei,
    gasPriceGwei: gwei.toFixed(4),
    ethGasPrice: `0x${gasPrice.toString(16)}` as Hex,
    network: c.env.NETWORK,
  });
});

export default app;
