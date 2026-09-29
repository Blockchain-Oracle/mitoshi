/** @cwf/markets — browser- and native-safe chain I/O. Server-only code lives under `@cwf/markets/server`. */
import { createPublicClient, http, type PublicClient } from "viem";
import { tempo, tempoModerato } from "viem/chains";
import type { Network } from "@cwf/core";

/** A read-only Tempo client for the given network. */
export function tempoReadClient(network: Network, rpcUrl?: string): PublicClient {
  const chain = network === "mainnet" ? tempo : tempoModerato;
  return createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
}
