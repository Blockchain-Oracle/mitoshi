/**
 * The chain definition the READ runtime uses (§3.1). viem's `tempo`/`tempoModerato` carry Tempo's `chainConfig`
 * (0x76 serializers, access-key and multisig actions, ox/tempo) — needed to sign and send, not to read balances, blocks
 * or the clock. Built with plain `defineChain`, the browser's read client stays out of that weight; signing paths
 * (the wallet runtime, the relay, scripts) keep `tempoChain()` from `chains.ts`.
 */
import { defineChain } from "viem";
import { NETWORKS, TEMPO_EXPLORER, TEMPO_RPC_HTTP, TEMPO_RPC_WS, type Network } from "@cwf/core";
import { UTILITIES } from "@cwf/clients";

export function tempoReadChain(network: Network) {
  return defineChain({
    id: NETWORKS[network],
    name: network === "mainnet" ? "Tempo" : "Tempo Testnet (Moderato)",
    nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
    rpcUrls: { default: { http: [TEMPO_RPC_HTTP[network]], webSocket: [TEMPO_RPC_WS[network]] } },
    blockExplorers: { default: { name: "Tempo Explorer", url: TEMPO_EXPLORER[network] } },
    contracts: { multicall3: { address: UTILITIES.multicall3 as `0x${string}` } },
    testnet: network === "testnet",
  });
}

export type TempoReadChain = ReturnType<typeof tempoReadChain>;
