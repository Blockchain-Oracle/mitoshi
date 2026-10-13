/**
 * The wallet-side provider methods (plan C.2.2): positions, holdings, claimables, history and the balance sheet. Which
 * Windows a wallet touched comes from the index (or the engine's own `Fill` logs when the index can't answer); every
 * balance is then read head-fresh from the lens (`positionsOf`), so money on screen is never an indexer figure.
 * Replaces Masayume 68f7a09:packages/markets/src/provider/{positions,claimables,history,balances}.ts.
 */
import { getAbiItem, getAddress, type Address } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { vaultDeploymentOf } from "../vault/read";
import { buildLedgers, heldCostOf, ledgerHasActivity, oneUnit, realizedOf, roundSettledAtMs, settleRound, USD_DECIMALS, type BalanceSheet, type ClaimableRow, type Holdings, type LedgerFill, type LedgerSide, type MarketId, type OnchainSnapshot, type OpenPosition, type Reading, type RoundMarket, type SettledRound, type WalletHistory } from "@cwf/core";
import { deploymentOf } from "../deployments";
import { getLogClient, getPublicClient } from "../runtime/read-runtime";
import { engineMayPay, engineVenue, readBalanceAndPositions, readPositions, readWindows, type EnginePosition, type WindowFacts } from "../engine/lens";
import { claimablesOf } from "../engine/claims";
import { PAIR_TICKS } from "../engine/calls";
import { engineReading } from "./engine-reads";
import { indexWalletFills, indexWalletMarkets, IndexUnavailableError, type IndexedFill } from "./index-api";
import { chainWalletFills, DEFAULT_LOOKBACK_BLOCKS, LOG_WINDOW } from "./chain-logs";
import { decodeEngineEvents, type RedeemedView } from "../engine/decode";
import { pinVerdict, type PinnedVerdict } from "../engine/verdict";
import { nowSec } from "../runtime/clock";
import { readVaultVerdict } from "../vault/positions";

const SIDES: readonly LedgerSide[] = ["BUY_YES", "SELL_YES", "BUY_NO", "SELL_NO"];
const lower = (a: string) => a.toLowerCase();

/** Every fill of the wallet: the index, or the engine's logs when the index can't answer. */
export async function walletFills(wallet: Address): Promise<{ fills: IndexedFill[]; complete: boolean }> {
  try {
    return await indexWalletFills(wallet);
  } catch (error) {
    if (!(error instanceof IndexUnavailableError)) throw error;
    return chainWalletFills(wallet);
  }
}

/** The Windows the wallet holds or held a position on. */
export async function walletMarketIds(wallet: Address, unredeemedOnly: boolean): Promise<MarketId[]> {
  try {
    return await indexWalletMarkets(wallet, unredeemedOnly);
  } catch (error) {
    if (!(error instanceof IndexUnavailableError)) throw error;
    return [...new Set((await chainWalletFills(wallet)).fills.map((f) => f.marketId))];
  }
}

/** A fill seen from the wallet's own side (taker or maker), in the ledger's units. */
export function toLedgerFill(wallet: Address, f: IndexedFill, w: Pick<WindowFacts, "series">): LedgerFill | null {
  const asTaker = lower(f.taker) === lower(wallet);
  if (!asTaker && lower(f.maker) !== lower(wallet)) return null;
  const side = SIDES[asTaker ? f.takerKind : f.makerKind];
  if (!side) return null;
  return { marketId: f.marketId, side, quantityRaw: f.lots * w.series.lotBase, yesPriceRaw: BigInt(f.priceTicks) * w.series.tickBase, atMs: f.tsSec * 1000, txHash: f.txHash };
}

const roundMarket = (w: WindowFacts): RoundMarket => ({
  marketId: w.marketId, asset: w.market.asset, intervalSec: w.market.intervalSec, expirySec: w.market.expirySec, decimals: w.market.decimals,
  settled: w.market.state !== "open", voided: w.market.state === "voided", winningOutcome: w.market.winningOutcome, resolvedAtMs: w.market.resolvedAtMs,
});

const heldOf = (p: EnginePosition, lotBase: bigint): Holdings => ({ upRaw: (p.yesFree + p.yesLocked) * lotBase, downRaw: (p.noFree + p.noLocked) * lotBase });

export const getHoldings = (wallet: Address, onchain: OnchainSnapshot): Promise<Reading<Holdings>> =>
  engineReading(`holdings:${lower(wallet)}:${onchain.marketId}`, async () => {
    const [w, [p]] = await Promise.all([readWindows([onchain.marketId]).then((m) => m.get(onchain.marketId)), readPositions(wallet, [onchain.marketId])]);
    if (!w || !p) return { upRaw: 0n, downRaw: 0n };
    return heldOf(p, w.series.lotBase);
  });

export const listOpenPositions = (wallet: Address): Promise<Reading<OpenPosition[]>> =>
  engineReading(`positions:${lower(wallet)}`, async () => {
    const ids = await walletMarketIds(wallet, true);
    const [windows, positions, { fills }] = await Promise.all([readWindows(ids), readPositions(wallet, ids), walletFills(wallet)]);
    const own = fills.flatMap((f) => {
      const w = windows.get(f.marketId);
      const lf = w ? toLedgerFill(wallet, f, w) : null;
      return lf ? [lf] : [];
    });
    const ledgers = buildLedgers(own, [], USD_DECIMALS);
    const out: OpenPosition[] = [];
    positions.forEach((p) => {
      const w = windows.get(p.marketId);
      if (!w || w.market.state !== "open") return;
      const held = heldOf(p, w.series.lotBase);
      if (held.upRaw + held.downRaw === 0n) return;
      const ledger = ledgers.get(p.marketId);
      // D-227: the cost of what is held now (average cost, a sale takes its share out), per side, on the lens balance.
      const up = heldCostOf(ledger?.heldUpRaw ?? 0n, ledger?.openCostUpBase ?? 0n, held.upRaw);
      const down = heldCostOf(ledger?.heldDownRaw ?? 0n, ledger?.openCostDownBase ?? 0n, held.downRaw);
      const cost = up.costBase + down.costBase;
      const last = w.snapshot.lastPriceTicks;
      // The last trade's mark (YES ticks; Down at the complement) — a fallback only; what Close pays is the exit walk.
      const mark = last === null ? cost : ((held.upRaw / w.series.lotBase) * BigInt(last) + (held.downRaw / w.series.lotBase) * BigInt(PAIR_TICKS - last)) * w.series.cashUnit;
      const size = held.upRaw + held.downRaw;
      out.push({
        marketId: p.marketId, asset: w.market.asset, intervalSec: w.market.intervalSec, expirySec: w.market.expirySec, decimals: w.market.decimals,
        balanceUpRaw: held.upRaw, balanceDownRaw: held.downRaw, costBasisBase: cost, costUpBase: up.costBase, costDownBase: down.costBase, costStale: up.stale || down.stale,
        avgCostRaw: size === 0n ? 0n : (cost * oneUnit(USD_DECIMALS)) / size, markValueBase: mark, unrealizedPnlBase: mark - cost, realizedPnlBase: ledger ? realizedOf(ledger) : 0n,
        soldCostBase: ledger ? ledger.costBase - ledger.openCostUpBase - ledger.openCostDownBase : 0n,
      });
    });
    return out.sort((a, b) => a.expirySec - b.expirySec);
  });

/** Every claimable row, head-fresh from the lens, with the receive-policy hold (D-048; C.2.2 `listClaimables`). */
export const listClaimables = (wallet: Address): Promise<Reading<ClaimableRow[]>> =>
  engineReading(`claimables:${lower(wallet)}`, async () => {
    const ids = await walletMarketIds(wallet, true);
    const [windows, positions, mayPay] = await Promise.all([readWindows(ids), readPositions(wallet, ids), engineMayPay(wallet)]);
    return claimablesOf(
      positions.flatMap((p) => {
        const w = windows.get(p.marketId);
        return w ? [{ market: w.market, lotBase: w.series.lotBase, position: p }] : [];
      }),
      mayPay,
    );
  });

export const listWalletHistory = (wallet: Address): Promise<Reading<WalletHistory>> =>
  engineReading(`history:${lower(wallet)}`, async () => {
    const { fills, complete } = await walletFills(wallet);
    const ids = [...new Set(fills.map((f) => f.marketId))];
    const [windows, positions] = await Promise.all([readWindows(ids), readPositions(wallet, ids)]);
    const own = fills.flatMap((f) => {
      const w = windows.get(f.marketId);
      const lf = w ? toLedgerFill(wallet, f, w) : null;
      return lf ? [lf] : [];
    });
    const ledgers = buildLedgers(own, [], USD_DECIMALS);
    const positionOf = new Map(positions.map((p) => [p.marketId, p]));
    const rounds: SettledRound[] = [];
    let openCount = 0;
    for (const [id, ledger] of ledgers) {
      const w = windows.get(id);
      if (!w || !ledgerHasActivity(ledger)) continue;
      const p = positionOf.get(id);
      const held = ledger.heldUpRaw + ledger.heldDownRaw > 0n;
      if (w.market.state === "open" && held) {
        openCount += 1;
        continue;
      }
      // Sold out while the Window still runs: the round closed on the book at its last fill (D-227 — its P&L is
      // realised, so the PnL card never drops it until the Window answers).
      const market = w.market.state === "open" ? { ...roundMarket(w), settled: true, resolvedAtMs: ledger.lastAtMs } : roundMarket(w);
      const round = settleRound({ ledger, market, feeBps: 0, liveHoldings: p ? heldOf(p, w.series.lotBase) : null });
      if (round) rounds.push(round);
    }
    rounds.sort((a, b) => roundSettledAtMs(b) - roundSettledAtMs(a));
    return { rounds, openCount, fillCount: own.length, complete: complete && own.length === fills.length, decimals: USD_DECIMALS };
  });

/**
 * pathUSD in the wallet, engine credit per Window, cash locked behind resting orders, the Trading Balance
 * (`EventVault.accountOf`) where the vault is deployed, and what waits to be collected — each labelled, nothing
 * silently summed (FR-5).
 */
export const getBalanceSheet = (wallet: Address): Promise<Reading<BalanceSheet>> =>
  engineReading(`balance:${lower(wallet)}`, async () => {
    const client = await getPublicClient();
    // The current Trading Balance (v2 once deployed, S24.2); a previous one's leftover shows on its own card.
    const vault = vaultDeploymentOf(client.chain.id)?.eventVault ?? null;
    const [ids, vaultAccount] = await Promise.all([
      walletMarketIds(wallet, true),
      vault ? client.readContract({ address: vault, abi: eventVaultAbi, functionName: "accountOf", args: [wallet] }) : Promise.resolve(null),
    ]);
    // The balance and the positions in one block (D-227): the settler's payout lands in one figure, never both or neither.
    const [{ balanceBase: spendableBase, positions }, windows] = await Promise.all([readBalanceAndPositions(wallet, ids), readWindows(ids)]);
    const engineCreditByMarket = positions.filter((p) => p.credit > 0n).map((p) => ({ marketId: p.marketId, amountBase: p.credit }));
    // What waits to be collected, from the same reads as the balance (D-227): equity never drops a Window at its answer
    // and gets it back at the payout, nor counts it twice once paid.
    const sources = positions.flatMap((p) => {
      const w = windows.get(p.marketId);
      return w ? [{ market: w.market, lotBase: w.series.lotBase, position: p }] : [];
    });
    const claims = claimablesOf(sources, true);
    return {
      decimals: USD_DECIMALS,
      spendableBase,
      orderEscrowBase: positions.reduce((s, p) => s + p.lockedCash, 0n),
      engineCreditBase: engineCreditByMarket.reduce((s, c) => s + c.amountBase, 0n),
      engineCreditByMarket,
      vaultBase: vaultAccount ? (vaultAccount as { available: bigint }).available : null,
      collectBase: claims.reduce((s, r) => s + r.netPayoutBase, 0n),
      collectByMarket: claims.filter((r) => r.kind === "win" || r.kind === "void").map((r) => ({ marketId: r.marketId, amountBase: r.netPayoutBase })),
    };
  });

const REDEEMED = getAbiItem({ abi: eventsEngineAbi, name: "Redeemed" });

/** The wallet's `Redeemed` events on one Window (holder indexed), oldest first, within the log lookback. */
export async function redeemedEvents(wallet: Address, marketId: MarketId): Promise<(RedeemedView & { txHash: `0x${string}` })[]> {
  const [client, venue] = await Promise.all([getLogClient(), engineVenue()]);
  const head = await client.getBlockNumber();
  const floor = head > DEFAULT_LOOKBACK_BLOCKS ? head - DEFAULT_LOOKBACK_BLOCKS : 0n;
  const out: (RedeemedView & { txHash: `0x${string}` })[] = [];
  for (let start = floor > venue.deployBlock ? floor : venue.deployBlock; start <= head; start += LOG_WINDOW) {
    const end = start + LOG_WINDOW - 1n < head ? start + LOG_WINDOW - 1n : head;
    const logs = await client.getLogs({ address: venue.engine, event: REDEEMED, args: { marketId, holder: wallet }, fromBlock: start, toBlock: end });
    for (const log of logs) out.push({ ...decodeEngineEvents(venue.engine, [log as never]).redeemed[0]!, txHash: log.transactionHash! });
  }
  return out;
}

/** The verdict pinned to the wallet's own position on a Window (D-048): call → settling → stamped → paid / held. */
export const getPinnedVerdict = (wallet: Address, marketId: MarketId): Promise<Reading<PinnedVerdict | null>> =>
  engineReading(`verdict:${lower(wallet)}:${marketId}`, async () => {
    const [windows, [position], redeemed, { fills }] = await Promise.all([readWindows([marketId]), readPositions(wallet, [marketId]), redeemedEvents(wallet, marketId), walletFills(wallet)]);
    const w = windows.get(marketId);
    if (!w) return null;
    const own = fills.filter((f) => f.marketId === marketId).flatMap((f) => {
      const lf = toLedgerFill(wallet, f, w);
      return lf ? [lf] : [];
    });
    const ledger = buildLedgers(own, [], USD_DECIMALS).get(marketId);
    const pinned = pinVerdict({
      wallet, snapshot: w.snapshot, position: position ?? null, lotBase: w.series.lotBase, redeemed, costBasisBase: ledger ? ledger.costBase - ledger.proceedsBase : null,
      settledAtMs: w.market.resolvedAtMs, nowSec: nowSec(),
    });
    // Nothing in the wallet's own engine position: the call may be the Trading Balance's (a session-key tap, S7).
    return pinned ?? (await readVaultVerdict(wallet, marketId));
  });
