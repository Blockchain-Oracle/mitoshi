/**
 * Relay policy for area "stocks" (S14; fragments.md "the stage adding sponsored calls").
 *
 * S14c deploys the bridge on Tempo (mirror TIP-20s, TIP20MintBurnAdapter proxies, StockSyncReceiver, ScaledUIViews) and
 * sponsors nothing: bridging out pays its LayerZero fee in the user's own pathUSD, and deliveries arrive through the
 * LayerZero executor, not the relay. S14w decides which calls the /bridge flow sponsors and lists them here.
 * Typed as `RelayPolicy` (S1 `relay/types.ts`) and listed in `policies/index.ts`; with no ABI and nothing sponsored, the
 * relay refuses every stocks call.
 */
import type { Address } from "viem";
import { relayTargets } from "@cwf/clients";
import type { RelayPolicy } from "../types";

/** The bridge contracts on every chain they are deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(relayTargets as Record<string, Record<string, readonly string[]>>).flatMap((byArea) => (byArea.stocks ?? []) as Address[]);

export const stocksRelayPolicy: RelayPolicy = {
  area: "stocks",
  targets,
  abi: [],
  sponsor: [],
  never: [],
  pillar: "stocks",
  entry: [],
  maxGas: 0n,
};
