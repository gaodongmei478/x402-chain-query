import express from "express";
import {
  paymentMiddlewareFromHTTPServer,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { isAddress, type Address } from "viem";
import {
  NETWORK,
  PAY_TO,
  PORT,
  PRICE_BALANCE,
  PRICE_GAS,
  FACILITATOR_URL,
  FREE_TRIAL_LIMIT,
} from "./config.js";
import { createFacilitatorClient } from "./facilitator.js";
import {
  freeTrialRemaining,
  freeTrialSnapshot,
  resolveTrialKey,
  tryConsumeFreeTrial,
} from "./freeTrial.js";
import { getEthBalance, getGasHint } from "./rpc.js";

async function main() {
  const facilitatorClient = await createFacilitatorClient();

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    NETWORK,
    new ExactEvmScheme(),
  );

  const routes = {
    "GET /balance": {
      accepts: [
        {
          scheme: "exact" as const,
          price: PRICE_BALANCE,
          network: NETWORK,
          payTo: PAY_TO,
        },
      ],
      description:
        "Query Base mainnet ETH balance (wei + ether) for an address",
      mimeType: "application/json",
      extensions: {
        ...declareDiscoveryExtension({
          input: {
            address: "0xc8aaea11c93a438e2fc7bd5cddb9a6936ed3595c",
          },
          inputSchema: {
            properties: {
              address: {
                type: "string",
                description: "EVM address to query on Base mainnet",
              },
            },
            required: ["address"],
          },
          output: {
            example: {
              address: "0xc8aaea11c93a438e2fc7bd5cddb9a6936ed3595c",
              chainId: 8453,
              token: "0x0000000000000000000000000000000000000000",
              symbol: "ETH",
              decimals: 18,
              balance: "1000000000000000000",
              balanceFormatted: "1",
              asOf: "2026-09-13T00:00:00.000Z",
              wei: "1000000000000000000",
              ether: "1",
              network: NETWORK,
            },
            schema: {
              type: "object",
              properties: {
                address: { type: "string" },
                wei: { type: "string" },
                ether: { type: "string" },
                network: { type: "string" },
              },
            },
          },
        }),
      },
    },
    "GET /gas": {
      accepts: [
        {
          scheme: "exact" as const,
          price: PRICE_GAS,
          network: NETWORK,
          payTo: PAY_TO,
        },
      ],
      description: "Base mainnet gas price hint via eth_gasPrice",
      mimeType: "application/json",
      extensions: {
        ...declareDiscoveryExtension({
          input: {},
          inputSchema: {
            properties: {},
          },
          output: {
            example: {
              chainId: 8453,
              baseFeePerGas: "1000000",
              maxPriorityFeePerGas: "1000000",
              maxFeePerGas: "3000000",
              gasPrice: "1000000",
              urgency: "slow",
              asOf: "2026-09-13T00:00:00.000Z",
              gasPriceWei: "1000000",
              gasPriceGwei: "0.0010",
              ethGasPrice: "0xf4240",
              network: NETWORK,
            },
            schema: {
              type: "object",
              properties: {
                gasPriceWei: { type: "string" },
                gasPriceGwei: { type: "string" },
                ethGasPrice: { type: "string" },
                network: { type: "string" },
              },
            },
          },
        }),
      },
    },
  };

  const httpServer = new x402HTTPResourceServer(resourceServer, routes);

  // Free trial N=10 in-memory per wallet address (or IP fallback)
  httpServer.onProtectedRequest(async (context) => {
    const adapter = context.adapter;
    const walletHeader = adapter.getHeader("x-wallet-address");
    const url = new URL(adapter.getUrl());
    const key = resolveTrialKey({
      walletHeader: walletHeader ?? undefined,
      payerQuery: url.searchParams.get("payer") ?? undefined,
      ip: adapter.getHeader("x-forwarded-for")?.split(",")[0]?.trim(),
    });
    if (tryConsumeFreeTrial(key)) {
      console.log(
        `[free-trial] grant key=${key} remaining=${freeTrialRemaining(key)}`,
      );
      return { grantAccess: true };
    }
    return;
  });

  const app = express();

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      network: NETWORK,
      payTo: PAY_TO,
      facilitator: FACILITATOR_URL,
      freeTrial: freeTrialSnapshot(),
      routes: {
        "/balance": PRICE_BALANCE,
        "/gas": PRICE_GAS,
      },
    });
  });

  app.use(paymentMiddlewareFromHTTPServer(httpServer));

  app.get("/balance", async (req, res) => {
    const address = String(req.query.address ?? "");
    if (!isAddress(address)) {
      res.status(400).json({
        error: "Missing or invalid ?address=0x... query parameter",
      });
      return;
    }
    try {
      const balance = await getEthBalance(address as Address);
      res.json({ ...balance, network: NETWORK });
    } catch (err) {
      res.status(502).json({
        error: "RPC balance query failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/gas", async (_req, res) => {
    try {
      const hint = await getGasHint();
      res.json({ ...hint, network: NETWORK });
    } catch (err) {
      res.status(502).json({
        error: "RPC eth_gasPrice failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.listen(PORT, () => {
    console.log(`x402 chain-query seller listening on http://127.0.0.1:${PORT}`);
    console.log(`  network: ${NETWORK}`);
    console.log(`  payTo:   ${PAY_TO}`);
    console.log(`  facilitator: ${FACILITATOR_URL}`);
    console.log(`  GET /balance  ${PRICE_BALANCE}`);
    console.log(`  GET /gas      ${PRICE_GAS}`);
    console.log(`  free trial: ${FREE_TRIAL_LIMIT} / address (in-memory)`);
    console.log(`  GET /health   (free)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
