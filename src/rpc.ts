import {
  createPublicClient,
  formatEther,
  http,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { BASE_RPC_URL, NETWORK } from "./config.js";

const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

const CHAIN_ID = 8453;
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;

export async function getEthBalance(address: Address): Promise<{
  address: Address;
  chainId: number;
  token: Address;
  symbol: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  asOf: string;
  /** @deprecated prefer balance; kept for curl demos */
  wei: string;
  /** @deprecated prefer balanceFormatted */
  ether: string;
  network: typeof NETWORK;
}> {
  const wei = await publicClient.getBalance({ address });
  const asOf = new Date().toISOString();
  const raw = wei.toString();
  const formatted = formatEther(wei);
  return {
    address,
    chainId: CHAIN_ID,
    token: NATIVE_TOKEN,
    symbol: "ETH",
    decimals: 18,
    balance: raw,
    balanceFormatted: formatted,
    asOf,
    wei: raw,
    ether: formatted,
    network: NETWORK,
  };
}

export async function getGasHint(): Promise<{
  chainId: number;
  baseFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  maxFeePerGas: string | null;
  gasPrice: string;
  urgency: "slow" | "standard" | "fast";
  asOf: string;
  /** legacy aliases */
  gasPriceWei: string;
  gasPriceGwei: string;
  ethGasPrice: Hex;
  network: typeof NETWORK;
}> {
  const asOf = new Date().toISOString();
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const gasPrice = await publicClient.getGasPrice();
  const tip = await publicClient
    .estimateMaxPriorityFeePerGas()
    .catch(() => 1_000_000n); // 0.001 gwei fallback

  const baseFee = block.baseFeePerGas ?? null;
  const maxPriority = tip;
  const maxFee =
    baseFee !== null ? baseFee * 2n + maxPriority : gasPrice + maxPriority;

  const gwei = Number(gasPrice) / 1e9;
  let urgency: "slow" | "standard" | "fast" = "standard";
  if (gwei < 0.01) urgency = "slow";
  else if (gwei > 0.1) urgency = "fast";

  const gasPriceWei = gasPrice.toString();
  return {
    chainId: CHAIN_ID,
    baseFeePerGas: baseFee !== null ? baseFee.toString() : null,
    maxPriorityFeePerGas: maxPriority.toString(),
    maxFeePerGas: maxFee.toString(),
    gasPrice: gasPriceWei,
    urgency,
    asOf,
    gasPriceWei,
    gasPriceGwei: gwei.toFixed(4),
    ethGasPrice: `0x${gasPrice.toString(16)}` as Hex,
    network: NETWORK,
  };
}
