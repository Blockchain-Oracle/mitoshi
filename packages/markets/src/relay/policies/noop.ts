/**
 * The S1 proof area: Multicall3 `getCurrentBlockTimestamp()` is a call that moves nothing. The gate proves a sponsored no-op
 * lands with fee payer = relay and that any other selector (e.g. `aggregate3`, which could run arbitrary calls) is
 * refused.
 */
import { multicall3Abi } from "viem";
import { UTILITIES } from "@cwf/clients";
import type { RelayPolicy } from "../types";

export const noopPolicy: RelayPolicy = {
  area: "noop",
  targets: [UTILITIES.multicall3],
  abi: multicall3Abi,
  sponsor: ["getCurrentBlockTimestamp"],
  never: ["aggregate", "aggregate3", "aggregate3Value", "blockAndAggregate", "tryAggregate", "tryBlockAndAggregate"],
  pillar: null,
  entry: [],
  maxGas: 100_000n,
};
