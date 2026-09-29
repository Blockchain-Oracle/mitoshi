/**
 * The ONE chain port for reads (AD-1; plan C.2.2), Tempo edition. Every method returns a `Reading<T>`; nothing throws
 * for a chain failure. Methods whose area is not deployed on this network answer the typed "not deployed" reading —
 * the surface shows "Not on this network yet", never a mock. S4 fills the engine reads (EngineLens batch views and our
 * index), S5 resolution/history, S7 the vault.
 */
import type { Address } from "viem";
import type { MarketsProvider } from "@cwf/core";
import { notDeployed } from "../deployments";
import { NETWORKS } from "@cwf/core";
import { marketsEnv } from "../runtime/read-runtime";
import { nowMs, sampleChainClock } from "../runtime/clock";
import { withReading } from "../runtime/reading";
import { readBalanceSheet } from "./balances";

export function createMarketsProvider(): MarketsProvider {
  const chainId = () => NETWORKS[marketsEnv().network];
  const engine = <T>() => Promise.resolve(notDeployed<T>("engine", chainId()));
  const vault = <T>() => Promise.resolve(notDeployed<T>("vault", chainId()));
  return {
    listLiveLanes: () => engine(),
    getMarket: () => engine(),
    listSettled: () => engine(),
    getOnchain: () => engine(),
    getBookDepth: () => engine(),
    getBookParams: () => engine(),
    freshQuoteStake: () => engine(),
    freshExitQuote: () => engine(),
    getOpeningPrice: () => engine(),
    // Prices come from ops (`/prices/latest` + the SSE stream) once the price relay runs (S3).
    getAssetPrice: () => engine(),
    getPriceHistory: () => engine(),
    settlementFeeBps: () => engine(),
    listOpenPositions: () => engine(),
    getHoldings: () => engine(),
    listClaimables: () => engine(),
    listWalletHistory: () => engine(),
    getBalanceSheet: (wallet: Address) => withReading(`balance:${wallet.toLowerCase()}`, () => readBalanceSheet(wallet)),
    syncClock: () => withReading("clock", () => sampleChainClock()),
    nowMs,
    nextWindow: () => engine(),
    getResolution: () => engine(),
    getVaultSnapshot: () => vault(),
    getVaultHoldings: () => vault(),
  };
}
