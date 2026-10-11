// Rebuilt on Tempo from Masayume 68f7a09:services/ops/src/actors/strategy-runner/{decide,execute}.ts — the venue reads
// become one multicall each over the lens and EventVaultV2, and an order is the session lane's own: `quoteFromBook`,
// the grant pre-checked the way the contract checks it (`simulateCaps`), a `placeFor` IOC at the taker expiry.
/**
 * The strategy runner's chain side (S9.5): which Windows of a strategy's series are trading with an open print, each
 * subscriber's STRATEGY grant and consent head-fresh, what each already holds there (one entry per Window), the book,
 * and the order — sized at the smallest of the per-trade cap, today's headroom and the budget. Reads only, except the
 * call it returns for `sendOps`.
 */
import { parseEventLogs, type Address, type Hex } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { dailyHeadroomBase, formatBaseUnits, oneUnit, orderExpirySec, ownTermsPriceRaw, simulateCaps, tickerById, USD_DECIMALS, type Quote, type Side, type SubscriptionMode, type VaultGrant } from "@cwf/core";
import { BOOK_LEVELS, levelsCall, TAKER_MIN_REST_SEC, zipLevels, type LevelsAnswer } from "../engine/lens";
import { quoteFromBook, type Grid, type YesBook } from "../engine/quote";

export type { YesBook } from "../engine/quote";
import { strategyVenueOf } from "../strategies/deployment";
import { placeForCall } from "../vault/calls";
import { toVaultGrant, vaultOutcomeId, type GrantTuple } from "../vault/read";
import type { Call } from "../tx/batch";
import type { OpsClient } from "./client";
import { fetchMarkets, fetchSeries, marketIdOf, venueOf, type Venue } from "./venue";

const NS = 1_000_000_000n;

export interface RunnerVenue extends Venue {
  registry: Address;
  /** The Trading Balance the registry reads grants from (D-218.1). */
  vault: Address;
}

export function runnerVenueOf(chainId: number): RunnerVenue | null {
  const s = strategyVenueOf(chainId);
  const v = venueOf(chainId);
  return s && v ? { ...v, registry: s.strategyRegistry, vault: s.vault } : null;
}

export interface RunnerWindow {
  marketId: Hex;
  seriesId: Hex;
  index: bigint;
  /** The spot symbol the Window settles on (`BTC`, or a stock's 24/7 `TSLA-24`). */
  spotSymbol: string | null;
  cadenceSec: number;
  tradingStartSec: number;
  lockAtSec: number;
  openPriceE8: bigint;
  grid: Grid;
}

/** Each series' trading Windows with an open print and room to enter (outside the 30 s no-entry buffer). */
export async function tradingWindowsOf(client: OpsClient, venue: Venue, seriesIds: readonly Hex[], nowSec: number): Promise<RunnerWindow[]> {
  if (seriesIds.length === 0) return [];
  const series = await fetchSeries(client, venue, seriesIds);
  const wanted = series.flatMap((s) => [1n, 2n].filter((k) => s.nextIndex >= k).map((k) => ({ s, id: marketIdOf(s.seriesId, s.nextIndex - k), index: s.nextIndex - k })));
  const views = await fetchMarkets(client, venue, wanted.map((w) => w.id));
  return wanted.flatMap(({ s, id, index }, i) => {
    const m = views[i];
    if (!m || m.state !== 0 || m.prints.open.source === 0 || m.tradingStartSec > nowSec) return [];
    if (orderExpirySec(nowSec, { lockAtSec: m.lockAtSec, intervalSec: s.cadenceSec }) === null) return [];
    const symbol = tickerById(s.ticker)?.symbol ?? null;
    return [{
      marketId: id, seriesId: s.seriesId, index, spotSymbol: symbol ? (s.lane === "stock24" ? `${symbol}-24` : symbol) : null, cadenceSec: s.cadenceSec,
      tradingStartSec: m.tradingStartSec, lockAtSec: m.lockAtSec, openPriceE8: m.prints.open.priceE8,
      grid: { lotBase: s.lotBase, tickBase: s.tickBase, cashUnit: s.cashUnit, minLots: s.minLots, decimals: USD_DECIMALS },
    }];
  });
}

export interface RunnerSubscriber {
  owner: Address;
  grantId: bigint;
  mode: SubscriptionMode;
}

export interface SubscriberState extends RunnerSubscriber {
  /** The grant the consent names, head-fresh; null when it can't be read. */
  grant: VaultGrant | null;
  /** The registry's own answer: consent on record and a live STRATEGY grant to this runner. */
  live: boolean;
}

/** Every subscriber's grant and liveness in one round trip. */
export async function readSubscriberStates(client: OpsClient, rv: RunnerVenue, strategyId: bigint, subs: readonly RunnerSubscriber[]): Promise<SubscriberState[]> {
  if (subs.length === 0) return [];
  const res = (await client.public.multicall({
    allowFailure: true,
    contracts: subs.flatMap((s) => [
      { address: rv.vault, abi: eventVaultV2Abi, functionName: "grantOf" as const, args: [s.grantId] as const },
      { address: rv.registry, abi: strategyRegistryAbi, functionName: "isSubscriptionLive" as const, args: [strategyId, s.owner] as const },
    ]),
  })) as { status: "success" | "failure"; result?: unknown }[];
  return subs.map((s, i) => {
    const g = res[2 * i]!;
    const l = res[2 * i + 1]!;
    return { ...s, grant: g.status === "success" ? toVaultGrant(s.grantId, g.result as GrantTuple) : null, live: l.status === "success" && l.result === true };
  });
}

/** What each owner already holds in each Window (both sides), keyed `owner:market`. */
export async function readHoldings(client: OpsClient, rv: RunnerVenue, pairs: readonly { owner: Address; marketId: Hex }[]): Promise<Map<string, { up: bigint; down: bigint }>> {
  const out = new Map<string, { up: bigint; down: bigint }>();
  if (pairs.length === 0) return out;
  const res = (await client.public.multicall({
    allowFailure: false,
    contracts: pairs.flatMap((p) => [0, 1].map((idx) => ({ address: rv.vault, abi: eventVaultV2Abi, functionName: "positionOf" as const, args: [p.owner, vaultOutcomeId(p.marketId, idx as 0 | 1)] as const }))),
  })) as bigint[];
  pairs.forEach((p, i) => out.set(`${p.owner.toLowerCase()}:${p.marketId.toLowerCase()}`, { up: res[2 * i]!, down: res[2 * i + 1]! }));
  return out;
}

/** The rested book of each Window (the taker's view: levels resting at least the engine's minimum). */
export async function readBooks(client: OpsClient, venue: Venue, marketIds: readonly Hex[]): Promise<Map<string, YesBook | null>> {
  const out = new Map<string, YesBook | null>();
  if (marketIds.length === 0) return out;
  const res = (await client.public.multicall({
    allowFailure: true,
    contracts: marketIds.flatMap((m) => [levelsCall(venue.lens, m as never, true, BOOK_LEVELS, TAKER_MIN_REST_SEC), levelsCall(venue.lens, m as never, false, BOOK_LEVELS, TAKER_MIN_REST_SEC)]) as never,
  })) as unknown as { status: "success" | "failure"; result?: unknown }[];
  marketIds.forEach((m, i) => {
    const [bids, asks] = [res[2 * i]!, res[2 * i + 1]!];
    out.set(m.toLowerCase(), bids.status === "success" && asks.status === "success" ? { bids: zipLevels(bids.result as LevelsAnswer), asks: zipLevels(asks.result as LevelsAnswer) } : null);
  });
  return out;
}

export type RunnerOrder = { ok: true; call: Call; quote: Quote; stakeBase: bigint } | { ok: false; why: string };

/**
 * One subscriber's order on one Window: the stake is the smallest of the per-trade cap, today's headroom and the
 * budget; the quote walks the rested book; the grant is checked as `placeFor` will check it, at the worst the fill can
 * charge — so a refusal is named here and nothing is sent.
 */
export function runnerOrder(rv: RunnerVenue, input: { grant: VaultGrant; window: RunnerWindow; side: Side; book: YesBook | null; held: { up: bigint; down: bigint }; nowSec: number; nowMs: number }): RunnerOrder {
  const { grant, window: w, side, book, held, nowSec, nowMs } = input;
  if (held.up + held.down > 0n) return { ok: false, why: "already in this Window" };
  const headroom = dailyHeadroomBase(grant, nowSec);
  const stakeBase = [grant.caps.maxStakePerTradeBase, headroom, grant.budgetBase].reduce((min, v) => (v < min ? v : min));
  if (stakeBase <= 0n) return { ok: false, why: "no headroom today" };
  if (!book) return { ok: false, why: "book unreadable" };
  const quote = quoteFromBook(book, w.grid, side, stakeBase, nowMs);
  if (!quote) return { ok: false, why: `nothing rests to fill $${formatBaseUnits(stakeBase, w.grid.decimals, { minDp: 2, maxDp: 2 })} of ${side.toUpperCase()}` };
  const verdict = simulateCaps({
    grant, nowSec, marketId: w.marketId as never, sidePriceRaw: ownTermsPriceRaw(quote.limitPriceRaw, side, w.grid.decimals), quantityRaw: quote.contractsRaw,
    spendBase: quote.maxCostBase, one: oneUnit(w.grid.decimals), opensNewPosition: true,
  });
  if (!verdict.ok) return { ok: false, why: `the grant refuses it (${verdict.refusal.kind})` };
  const expirySec = orderExpirySec(nowSec, { lockAtSec: w.lockAtSec, intervalSec: w.cadenceSec });
  if (expirySec === null) return { ok: false, why: "inside the no-entry buffer before lock" };
  const call = placeForCall(rv.vault, { grantId: grant.grantId, marketId: w.marketId, outcomeIdx: side === "up" ? 0 : 1, isBuy: true, priceRaw: quote.limitPriceRaw, quantityRaw: quote.contractsRaw, expireNs: BigInt(expirySec) * NS });
  return { ok: true, call, quote, stakeBase };
}

/** What the vault booked for one runner order (its `Executed` event): collateral spent and contracts gained. */
export function runnerFillOf(logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[], rv: RunnerVenue, owner: Address, marketId: Hex, grantId: bigint): { cashDeltaBase: bigint; tokenDeltaRaw: bigint; outcomeIdx: number } | null {
  const hit = parseEventLogs({ abi: eventVaultV2Abi, eventName: "Executed", logs: logs as never }).find(
    (l) => l.address.toLowerCase() === rv.vault.toLowerCase() && l.args.owner.toLowerCase() === owner.toLowerCase() && l.args.marketId.toLowerCase() === marketId.toLowerCase() && l.args.grantId === grantId && l.args.isBuy,
  );
  return hit ? { cashDeltaBase: hit.args.cashDelta, tokenDeltaRaw: hit.args.tokenDelta, outcomeIdx: Number(hit.args.outcomeIdx) } : null;
}
