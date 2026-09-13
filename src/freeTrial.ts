import { isAddress } from "viem";
import { FREE_TRIAL_LIMIT } from "./config.js";

/** In-memory free-trial counters keyed by normalized client address / IP. */
const usage = new Map<string, number>();

export function freeTrialRemaining(key: string): number {
  const used = usage.get(key) ?? 0;
  return Math.max(0, FREE_TRIAL_LIMIT - used);
}

/**
 * Consume one free trial for `key` if remaining.
 * @returns true if access should be granted without payment
 */
export function tryConsumeFreeTrial(key: string): boolean {
  if (FREE_TRIAL_LIMIT <= 0) return false;
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  const used = usage.get(normalized) ?? 0;
  if (used >= FREE_TRIAL_LIMIT) return false;
  usage.set(normalized, used + 1);
  return true;
}

/** Prefer wallet address header/query; fall back to IP string. */
export function resolveTrialKey(opts: {
  walletHeader?: string | string[] | undefined;
  payerQuery?: unknown;
  ip?: string | undefined;
}): string {
  const headerRaw = Array.isArray(opts.walletHeader)
    ? opts.walletHeader[0]
    : opts.walletHeader;
  if (headerRaw && isAddress(headerRaw)) return headerRaw.toLowerCase();
  const q = typeof opts.payerQuery === "string" ? opts.payerQuery : undefined;
  if (q && isAddress(q)) return q.toLowerCase();
  return (opts.ip ?? "unknown").toLowerCase();
}

export function freeTrialSnapshot(): {
  limit: number;
  entries: number;
} {
  return { limit: FREE_TRIAL_LIMIT, entries: usage.size };
}
