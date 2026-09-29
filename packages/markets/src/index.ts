/**
 * @cwf/markets — browser- and native-safe chain I/O (plan C.2.4). Server-only code lives under `@cwf/markets/server`,
 * React hooks under `@cwf/markets/react`.
 */
export * from "./chains";
export * from "./deployments";
export * from "./env";
export * from "./errors";
export * from "./random";
export * from "./relay";
export * from "./runtime";
export * from "./sessions";
export * from "./submitter";
export * from "./tx";
export { createMarketsProvider } from "./provider";

import { createPublicClient, http, type PublicClient } from "viem";
import type { Network } from "@cwf/core";
import { tempoChain } from "./chains";

/** A standalone read-only Tempo client for the given network (scripts, ops probes). */
export function tempoReadClient(network: Network, rpcUrl?: string): PublicClient {
  return createPublicClient({ chain: tempoChain(network), transport: http(rpcUrl) }) as PublicClient;
}
