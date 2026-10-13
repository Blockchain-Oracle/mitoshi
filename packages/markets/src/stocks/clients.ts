/**
 * The bridge's three read clients (S14w; D-227 R4-12): Tempo through the shared read runtime (browser) or a given
 * client (ops), and Robinhood Chain + Base Sepolia over plain HTTP — the same public transports wagmi's SIDE_CHAINS use
 * (`http()` on viem's chain definitions), or a provider URL on the server (`RH_RPC_HTTP_URL`,
 * `BASE_SEPOLIA_RPC_HTTP_URL`). Read-only: nothing here holds a key.
 */
import { createPublicClient, http, type PublicClient } from "viem";
import type { Network } from "@cwf/core";
import { baseSepolia, robinhood, robinhoodTestnet } from "../chains";
import { getPublicClient } from "../runtime/read-runtime";

export interface BridgeClients {
  network: Network;
  tempo: PublicClient;
  robinhood: PublicClient;
  /** Null on mainnet (no hop). */
  base: PublicClient | null;
}

export interface SideRpc {
  robinhood?: string | undefined;
  base?: string | undefined;
}

const cache = new Map<string, PublicClient>();

function side(chain: typeof robinhood | typeof robinhoodTestnet | typeof baseSepolia, url: string | undefined): PublicClient {
  const key = `${chain.id}:${url ?? ""}`;
  let c = cache.get(key);
  if (!c) {
    c = createPublicClient({ chain, transport: http(url, { batch: true, retryCount: 1 }) }) as PublicClient;
    cache.set(key, c);
  }
  return c;
}

/** Robinhood and Base clients for a network. */
export function sideClients(network: Network, rpc: SideRpc = {}): { robinhood: PublicClient; base: PublicClient | null } {
  return {
    robinhood: side(network === "mainnet" ? robinhood : robinhoodTestnet, rpc.robinhood),
    base: network === "mainnet" ? null : side(baseSepolia, rpc.base),
  };
}

/** All three, the Tempo one from the browser's shared read runtime. */
export async function browserBridgeClients(network: Network): Promise<BridgeClients> {
  const tempo = (await getPublicClient()) as unknown as PublicClient;
  return { network, tempo, ...sideClients(network) };
}
