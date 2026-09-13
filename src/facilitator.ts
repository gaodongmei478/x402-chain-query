import { HTTPFacilitatorClient } from "@x402/core/server";
import { FACILITATOR_URL, NETWORK } from "./config.js";

type SupportedLike = Awaited<ReturnType<HTTPFacilitatorClient["getSupported"]>>;

/**
 * Minimal supported payload so initialize() works without CDP JWT.
 * ExactEvmScheme ignores supportedKind extras; verify/settle still need CDP keys.
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
 * HTTPFacilitatorClient → CDP mainnet facilitator URL.
 * With CDP_API_KEY_ID + CDP_API_KEY_SECRET uses createCdpFacilitatorClient.
 * Without keys, getSupported falls back to a local stub for unpaid 402 demos.
 */
export async function createFacilitatorClient(): Promise<HTTPFacilitatorClient> {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;

  if (apiKeyId && apiKeySecret) {
    try {
      const { createCdpFacilitatorClient } = await import(
        "@coinbase/cdp-sdk/x402"
      );
      const client = createCdpFacilitatorClient({
        apiKeyId,
        apiKeySecret,
        baseUrl: FACILITATOR_URL,
      });
      return client as unknown as HTTPFacilitatorClient;
    } catch (err) {
      console.warn(
        "[facilitator] @coinbase/cdp-sdk/x402 unavailable; falling back:",
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    console.warn(
      "[facilitator] CDP_API_KEY_ID / CDP_API_KEY_SECRET not set. " +
        "Local /supported stub enabled; verify/settle need CDP keys.",
    );
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
