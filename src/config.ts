import type { Address } from "viem";

/** Base mainnet CAIP-2 network id (production default) */
export const NETWORK = "eip155:8453" as const;

/**
 * Base Sepolia (`eip155:84532`) is documented only for local smoke against a
 * test facilitator — never point real money / CDP mainnet settle at Sepolia,
 * and never use the x402.org test facilitator for mainnet funds.
 */
export const NETWORK_SEPOLIA_SMOKE = "eip155:84532" as const;

export const PAY_TO = (process.env.PAY_TO ??
  "0xc8aaea11c93a438e2fc7bd5cddb9a6936ed3595c") as Address;

export const FACILITATOR_URL =
  process.env.FACILITATOR_URL ??
  "https://api.cdp.coinbase.com/platform/v2/x402";

export const BASE_RPC_URL =
  process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

export const PORT = Number(process.env.PORT ?? "4021");

/** Owner-locked prices (USD USDC exact on Base mainnet) */
export const PRICE_BALANCE = "$0.01";
export const PRICE_GAS = "$0.01";

/** Free unpaid trials per client address (in-memory) */
export const FREE_TRIAL_LIMIT = Number(process.env.FREE_TRIAL_LIMIT ?? "10");
