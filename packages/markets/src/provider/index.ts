/**
 * The ONE chain port for reads (AD-1; plan C.2.2), Tempo edition. Every method returns a `Reading<T>`; nothing throws
 * for a chain failure. Windows and wallets read head-fresh through EngineLens, discovered through our index (or the
 * chain itself when the index can't answer); prices come from ops. An area not deployed on this network answers the
 * typed "not deployed" reading — never a mock. The Trading Balance's snapshot and holdings read the EventVault (S7).
 */
import { ok, type MarketsProvider } from "@cwf/core";
import { nowMs, sampleChainClock } from "../runtime/clock";
import { withReading } from "../runtime/reading";
import * as engine from "./engine-reads";
import * as wallet from "./wallet-reads";
import { fetchAssetPrice, fetchPriceHistory } from "./prices";
import { getVaultHoldings, getVaultSnapshot } from "../vault/read";

export function createMarketsProvider(): MarketsProvider {
  return {
    listLiveLanes: engine.listLiveLanes,
    getMarket: engine.getMarket,
    listSettled: engine.listSettled,
    getOnchain: engine.getOnchain,
    getBookDepth: engine.getBookDepth,
    getBookParams: engine.getBookParams,
    freshQuoteStake: engine.freshQuoteStake,
    freshExitQuote: engine.freshExitQuote,
    getOpeningPrice: engine.getOpeningPrice,
    getAssetPrice: (asset) => withReading(`price:${asset}`, () => fetchAssetPrice(asset)),
    getPriceHistory: (asset, fromSec, toSec) => withReading(`history:${asset}:${fromSec}:${toSec}`, () => fetchPriceHistory(asset, fromSec, toSec)),
    // Q-005: the engine has no settlement fee (Agari), so every Window's fee is 0 by construction.
    settlementFeeBps: () => Promise.resolve(ok(0, nowMs())),
    listOpenPositions: wallet.listOpenPositions,
    getHoldings: wallet.getHoldings,
    listClaimables: wallet.listClaimables,
    listWalletHistory: wallet.listWalletHistory,
    getBalanceSheet: wallet.getBalanceSheet,
    getPinnedVerdict: wallet.getPinnedVerdict,
    syncClock: () => withReading("clock", () => sampleChainClock()),
    nowMs,
    nextWindow: engine.nextWindow,
    getResolution: engine.getResolution,
    getVaultSnapshot,
    getVaultHoldings: (wallet, onchain) => getVaultHoldings(wallet, onchain.marketId),
  };
}

export * from "./engine-reads";
export * from "./wallet-reads";
export * from "./prices";
export * from "./index-api";
export { chainWalletFills } from "./chain-logs";
