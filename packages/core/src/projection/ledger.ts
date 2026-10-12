// Ported from Masayume 68f7a09:packages/core/src/projection/ledger.ts — with the open cost per side (D-227): what the
// contracts still held cost at average cost, so a Reduce, a merge or a re-entry leaves the rest at its own cost.
import type { MarketId, OutcomeIdx } from "../types/market";
import type { Hex } from "../types/primitives";
import { oneUnit } from "../units/decimals";
import type { LedgerFill, LedgerSetAction, MarketLedger } from "./types";

type Event = { atMs: number; seq: number; marketId: MarketId; txHash: Hex; apply: (ledger: MarketLedger) => void };

const UP: OutcomeIdx = 0;
const DOWN: OutcomeIdx = 1;

function fresh(marketId: MarketId, atMs: number, txHash: Hex): MarketLedger {
  return { marketId, heldUpRaw: 0n, heldDownRaw: 0n, costBase: 0n, proceedsBase: 0n, openCostUpBase: 0n, openCostDownBase: 0n, sidesTraded: [], fillCount: 0, shortCount: 0, firstAtMs: atMs, lastAtMs: atMs, entryTxHash: txHash };
}

function noteSide(ledger: MarketLedger, side: OutcomeIdx): void {
  if (!ledger.sidesTraded.includes(side)) ledger.sidesTraded.push(side);
}

function buy(ledger: MarketLedger, side: OutcomeIdx, quantityRaw: bigint, priceRaw: bigint, one: bigint): void {
  const paid = (quantityRaw * priceRaw) / one;
  if (side === UP) {
    ledger.heldUpRaw += quantityRaw;
    ledger.openCostUpBase += paid;
  } else {
    ledger.heldDownRaw += quantityRaw;
    ledger.openCostDownBase += paid;
  }
  ledger.costBase += paid;
  noteSide(ledger, side);
}

/** The open cost a sale of `sold` out of `held` takes with it (average cost); all of it when nothing stays. */
export function soldShare(openCost: bigint, sold: bigint, held: bigint): bigint {
  if (held <= 0n || sold <= 0n) return 0n;
  return sold >= held ? openCost : (openCost * sold) / held;
}

/**
 * A sell beyond inventory is a collateral-backed short, and the venue hands the seller the
 * complement: selling UP you do not hold is buying DOWN at (1 − price). Verified against the
 * chain's own balances (2026-09-02): the indexer labels these plain sells, the wallet ends up
 * holding the other side. The part that was inventory is a real sell with real proceeds.
 */
function sell(ledger: MarketLedger, side: OutcomeIdx, quantityRaw: bigint, priceRaw: bigint, one: bigint): void {
  const held = side === UP ? ledger.heldUpRaw : ledger.heldDownRaw;
  const sold = quantityRaw < held ? quantityRaw : held;
  const shorted = quantityRaw - sold;
  if (sold > 0n) {
    if (side === UP) {
      ledger.openCostUpBase -= soldShare(ledger.openCostUpBase, sold, held);
      ledger.heldUpRaw -= sold;
    } else {
      ledger.openCostDownBase -= soldShare(ledger.openCostDownBase, sold, held);
      ledger.heldDownRaw -= sold;
    }
    ledger.proceedsBase += (sold * priceRaw) / one;
  }
  if (shorted > 0n) {
    ledger.shortCount += 1;
    buy(ledger, side === UP ? DOWN : UP, shorted, one - priceRaw, one);
  }
}

function fillEvent(fill: LedgerFill, seq: number, one: bigint): Event {
  const isUp = fill.side === "BUY_YES" || fill.side === "SELL_YES";
  const isBuy = fill.side === "BUY_YES" || fill.side === "BUY_NO";
  const side: OutcomeIdx = isUp ? UP : DOWN;
  // The book prices in YES terms; the DOWN leg pays the complement (canon #20).
  const priceRaw = isUp ? fill.yesPriceRaw : one - fill.yesPriceRaw;
  return {
    atMs: fill.atMs,
    seq,
    marketId: fill.marketId,
    txHash: fill.txHash,
    apply: (ledger) => {
      ledger.fillCount += 1;
      if (isBuy) buy(ledger, side, fill.quantityRaw, priceRaw, one);
      else sell(ledger, side, fill.quantityRaw, priceRaw, one);
    },
  };
}

/** A complete set costs exactly one collateral per pair and merges back for the same, gross. */
function setEvent(action: LedgerSetAction, seq: number): Event {
  return {
    atMs: action.atMs,
    seq,
    marketId: action.marketId,
    txHash: action.txHash,
    apply: (ledger) => {
      if (action.kind === "mint") {
        // A pair costs one collateral: half a dollar a side, the odd base unit on Down so the two sum exactly.
        const half = action.amountRaw / 2n;
        ledger.heldUpRaw += action.amountRaw;
        ledger.heldDownRaw += action.amountRaw;
        ledger.openCostUpBase += half;
        ledger.openCostDownBase += action.amountRaw - half;
        ledger.costBase += action.amountRaw;
        noteSide(ledger, UP);
        noteSide(ledger, DOWN);
      } else {
        const pairs = action.amountRaw < ledger.heldUpRaw ? action.amountRaw : ledger.heldUpRaw;
        const merged = pairs < ledger.heldDownRaw ? pairs : ledger.heldDownRaw;
        ledger.openCostUpBase -= soldShare(ledger.openCostUpBase, merged, ledger.heldUpRaw);
        ledger.openCostDownBase -= soldShare(ledger.openCostDownBase, merged, ledger.heldDownRaw);
        ledger.heldUpRaw -= merged;
        ledger.heldDownRaw -= merged;
        ledger.proceedsBase += merged;
      }
    },
  };
}

/**
 * Replays a wallet's fills and router actions oldest-first into one ledger per market.
 *
 * Order matters twice: a sell only counts as a sell against inventory bought before it, and a
 * merge can only remove pairs already held. Ties on the timestamp keep arrival order.
 */
export function buildLedgers(fills: readonly LedgerFill[], actions: readonly LedgerSetAction[], decimals: number): Map<MarketId, MarketLedger> {
  const one = oneUnit(decimals);
  const events: Event[] = [...fills.map((fill, i) => fillEvent(fill, i, one)), ...actions.map((action, i) => setEvent(action, fills.length + i))];
  events.sort((a, b) => a.atMs - b.atMs || a.seq - b.seq);

  const ledgers = new Map<MarketId, MarketLedger>();
  for (const event of events) {
    const ledger = ledgers.get(event.marketId) ?? fresh(event.marketId, event.atMs, event.txHash);
    event.apply(ledger);
    ledger.lastAtMs = event.atMs;
    ledgers.set(event.marketId, ledger);
  }
  return ledgers;
}

/** True while the wallet still holds something here, or ever traded — a ledger with no fills is not a round. */
export function ledgerHasActivity(ledger: MarketLedger): boolean {
  return ledger.fillCount > 0 || ledger.costBase > 0n;
}

/** What the contracts still held cost (both sides). */
export const openCostOf = (ledger: Pick<MarketLedger, "openCostUpBase" | "openCostDownBase">): bigint => ledger.openCostUpBase + ledger.openCostDownBase;

/** What sales and merges already realised: proceeds less the open cost they took out (`costBase − open cost`). */
export const realizedOf = (ledger: Pick<MarketLedger, "costBase" | "proceedsBase" | "openCostUpBase" | "openCostDownBase">): bigint => ledger.proceedsBase - (ledger.costBase - openCostOf(ledger));

/**
 * One side's open cost against the head-fresh balance (D-227: the indexer lags the lens by a block or two). The same
 * count is the ledger's figure; a different one scales it at the ledger's average cost (an Add or a sale not indexed
 * yet); contracts the ledger never saw have no cost to scale and read `stale`, never a free position.
 */
export function heldCostOf(ledgerHeldRaw: bigint, openCostBase: bigint, heldRaw: bigint): { costBase: bigint; stale: boolean } {
  if (heldRaw <= 0n) return { costBase: 0n, stale: false };
  if (ledgerHeldRaw === heldRaw) return { costBase: openCostBase, stale: false };
  if (ledgerHeldRaw <= 0n) return { costBase: 0n, stale: true };
  return { costBase: (openCostBase * heldRaw) / ledgerHeldRaw, stale: false };
}
