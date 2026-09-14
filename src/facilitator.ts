import { HTTPFacilitatorClient } from "@x402/core/server";
import { FACILITATOR_URL, NETWORK } from "./config.js";

type SupportedLike = Awaited<ReturnType<HTTPFacilitatorClient["getSupported"]>>;

const CDP_HOST_MARKER = "api.cdp.coinbase.com";

/**
 * Minimal supported payload so initialize() works if remote /supported fails.
 * Never use the x402.org test facilitator for mainnet / real money.
 */
function localSupportedStub(): SupportedLike {
  return {
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: NETWORK,
      },
    ],
    extensions: ["bazaar"],
    signers: {
      eip155: [],
    },
  } as SupportedLike;
}

/**
 * Default: plain HTTPFacilitatorClient(FACILITATOR_URL) — PayAI needs no keys.
 * CDP only when BOTH CDP_API_KEY_ID + CDP_API_KEY_SECRET are set AND
 * FACILITATOR_URL still points at api.cdp.coinbase.com.
 */
export async function createFacilitatorClient(): Promise<HTTPFacilitatorClient> {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const useCdp =
    Boolean(apiKeyId && apiKeySecret) &&
    FACILITATOR_URL.includes(CDP_HOST_MARKER);

  if (useCdp) {
    try {
      const { createCdpFacilitatorClient } = await import(
        "@coinbase/cdp-sdk/x402"
      );
      const client = createCdpFacilitatorClient({
        apiKeyId: apiKeyId!,
        apiKeySecret: apiKeySecret!,
        baseUrl: FACILITATOR_URL,
      });
      return client as unknown as HTTPFacilitatorClient;
    } catch (err) {
      console.warn(
        "[facilitator] @coinbase/cdp-sdk/x402 unavailable; falling back:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const client = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const remoteGetSupported = client.getSupported.bind(client);
  client.getSupported = async () => {
    try {
      return await remoteGetSupported();
    } catch (err) {
      console.warn(
        "[facilitator] remote getSupported failed; using local stub:",
        err instanceof Error ? err.message : err,
      );
      return localSupportedStub();
    }
  };
  return client;
}
