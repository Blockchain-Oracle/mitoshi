/**
 * Relay policy for area "stocks" (S14; fragments.md "the stage adding sponsored calls"; R4-12 / D-227 decides it).
 *
 * The bridge on Tempo is the mirror TIP-20s, the TIP20MintBurnAdapter proxies, StockSyncReceiver and the ScaledUIViews.
 * The relay pays only for the two exits from a deferred credit, so getting your stock out never waits on a fee:
 * - `sponsor`: `claimDeferred` (mints to `msg.sender` what an earlier credit deferred) and `sendDeferred` (sends it back
 *   to Robinhood Chain; the LayerZero fee is still the holder's pathUSD, pulled by `LzdFee` — only gas is sponsored).
 * - `never`: `send` (a bridge-out the holder pays for, like any transfer) and the admin surface.
 * - Approvals: only `pathUSD.approve(adapter, exact fee)` rides along with `sendDeferred` (the validator's spender check).
 * - No geofence entry: both are exits (C.3.5).
 * - `maxGas`: a claim mints to what may be a fresh holder (~0.54M on Tempo, F14-6) and a send-back pays the endpoint's
 *   writes; 3M keeps ≥ 1.5× headroom over the adapter's measured worst case (acceptance/S14.md, F14-13).
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import type { RelayPolicy } from "../types";

/** The bridge contracts on every chain they are deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(relayTargets as Record<string, Record<string, readonly string[]>>).flatMap((byArea) => (byArea.stocks ?? []) as Address[]);

export const STOCKS_MAX_GAS = 3_000_000n;

export const stocksRelayPolicy: RelayPolicy = {
  area: "stocks",
  targets,
  abi: tIP20MintBurnAdapterAbi as Abi,
  sponsor: ["claimDeferred", "sendDeferred"],
  never: ["send", "setGuardian", "pauseSends", "setOutboundLimit", "setInboundLimit", "lowerLimit", "setPeer", "setDelegate", "setEnforcedOptions", "setMsgInspector", "setPreCrime", "transferOwnership", "renounceOwnership", "initialize"],
  pillar: "stocks",
  entry: [],
  maxGas: STOCKS_MAX_GAS,
};
