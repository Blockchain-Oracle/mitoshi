import { NETWORKS } from "@cwf/core";
import { webEnv } from "@/lib/env";

/** The Tempo chain this build serves. */
export const TEMPO_CHAIN_ID: number = NETWORKS[webEnv.markets.network];
