// Rebuilt on Tempo from Masayume 68f7a09:services/ops/src/actors/x-relay/execute.ts (`liveWindow`, the grant checks,
// `submitOrder` on `route: vault-grant`) the way `strategy-runner.ts` rebuilt the runner (S9.5): one multicall per read,
// the order quoted from the rested book, pre-checked as `placeFor` checks it (`simulateCaps`), and a `placeFor` IOC at
// the taker expiry — signed by the executor an EXECUTOR grant names (S11, D-227).
/**
 * The x-relay's chain side: the account's live EXECUTOR grant on the current Trading Balance, the Window a mention asks
 * for (its ticker and cadence, on the lanes that price it, `xLanesOf`), and the order — the stake the mention named,
 * never more than the grant's budget. Reads only, except the call it returns for `sendOps`.
 */
import type { Address, Hex } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { GRANT_KIND_INDEX, noEntryCutoffSec, oneUnit, orderExpirySec, ownTermsPriceRaw, simulateCaps, tickerById, USD_DECIMALS, xLanesOf, type CapRefusal, type Quote, type Side, type VaultGrant, type XAsset, type XRefusalCode, type XWindowCode } from "@cwf/core";
import { quoteFromBook, type YesBook } from "../engine/quote";
import { placeForCall } from "../vault/calls";
import { toVaultGrant, vaultDeploymentOf, type GrantTuple } from "../vault/read";
import type { Call } from "../tx/batch";
import type { OpsClient } from "./client";
import type { RunnerWindow } from "./strategy-runner";
import { fetchMarkets, fetchSeries, listSeries, marketIdOf, venueOf, type SeriesView, type Venue } from "./venue";

const NS = 1_000_000_000n;

export interface XVenue extends Venue {
  /** The current Trading Balance (EventVaultV2): where every new grant is made. */
  vault: Address;
}

export function xVenueOf(chainId: number): XVenue | null {
  const v = venueOf(chainId);
  const d = vaultDeploymentOf(chainId);
  return v && d && d.version === 2 ? { ...v, vault: d.eventVault } : null;
}

/** The account's live EXECUTOR grant (`activeGrantOf(owner, EXECUTOR)` → `grantOf`), head-fresh; null when it has none. */
export async function readExecutorGrant(client: OpsClient, xv: XVenue, owner: Address): Promise<VaultGrant | null> {
  const contract = { address: xv.vault, abi: eventVaultV2Abi } as const;
  const id = (await client.public.readContract({ ...contract, functionName: "activeGrantOf", args: [owner, GRANT_KIND_INDEX.executor] })) as bigint;
  if (id === 0n) return null;
  const tuple = (await client.public.readContract({ ...contract, functionName: "grantOf", args: [id] })) as unknown as GrantTuple;
  return toVaultGrant(id, tuple);
}

export type XWindowPick = { ok: true; window: RunnerWindow; lane: string } | { ok: false; code: XWindowCode; lane: string | null; entryClosesAtSec?: number; nextWindowAtSec?: number };

let seriesCache: { atMs: number; series: SeriesView[] } | null = null;
const SERIES_TTL_MS = 10 * 60_000;

/** The listed Series (cached ten minutes: a Series is created once and never removed). */
async function cachedSeries(client: OpsClient, venue: Venue): Promise<SeriesView[]> {
  if (!seriesCache || Date.now() - seriesCache.atMs > SERIES_TTL_MS) seriesCache = { atMs: Date.now(), series: await listSeries(client, venue) };
  return seriesCache.series;
}

/**
 * The Window a mention asks for: the soonest-expiring one trading now with its open print and room to enter, on the
 * first lane (`xLanesOf`) that has one; else the nearest reason — waiting on its open, entries closed, not started, or
 * no such Window. Never another ticker or cadence.
 */
export async function pickXWindow(client: OpsClient, venue: Venue, asset: XAsset, cadenceSec: number, nowSec: number): Promise<XWindowPick> {
  const all = await cachedSeries(client, venue);
  let reason: Exclude<XWindowPick, { ok: true }> | null = null;
  for (const lane of xLanesOf(asset)) {
    const ids = all.filter((s) => s.symbol === asset && s.lane === lane && s.cadenceSec === cadenceSec && s.nextIndex > 0n).map((s) => s.seriesId);
    if (ids.length === 0) continue;
    const series = await fetchSeries(client, venue, ids);
    const wanted = series.flatMap((s) => [1n, 2n].filter((k) => s.nextIndex >= k).map((k) => ({ s, index: s.nextIndex - k, id: marketIdOf(s.seriesId, s.nextIndex - k) })));
    const views = await fetchMarkets(client, venue, wanted.map((w) => w.id));
    const rows = wanted.flatMap((w, i) => (views[i] && views[i]!.state === 0 ? [{ ...w, m: views[i]! }] : [])).sort((a, b) => a.m.expirySec - b.m.expirySec);
    for (const { s, id, index, m } of rows) {
      const entry = { lockAtSec: m.lockAtSec, intervalSec: s.cadenceSec };
      if (m.tradingStartSec > nowSec) {
        reason ??= { ok: false, code: "window-not-started", lane, nextWindowAtSec: m.tradingStartSec };
        continue;
      }
      if (orderExpirySec(nowSec, entry) === null) {
        if (!reason || reason.code === "window-not-started") reason = { ok: false, code: "window-entry-closed", lane, entryClosesAtSec: noEntryCutoffSec(entry) };
        continue;
      }
      if (m.prints.open.source === 0) {
        reason = { ok: false, code: "opening-price-pending", lane };
        continue;
      }
      const symbol = tickerById(s.ticker)?.symbol ?? null;
      return {
        ok: true, lane,
        window: {
          marketId: id, seriesId: s.seriesId, index, spotSymbol: symbol ? (s.lane === "stock24" ? `${symbol}-24` : symbol) : null, cadenceSec: s.cadenceSec,
          tradingStartSec: m.tradingStartSec, lockAtSec: m.lockAtSec, expirySec: m.expirySec, openPriceE8: m.prints.open.priceE8,
          grid: { lotBase: s.lotBase, tickBase: s.tickBase, cashUnit: s.cashUnit, minLots: s.minLots, decimals: USD_DECIMALS },
        },
      };
    }
  }
  return reason ?? { ok: false, code: "no-window", lane: null };
}

/** A grant check `placeFor` would fail, as the public refusal an X reply carries. */
export function capRefusalCode(refusal: CapRefusal): XRefusalCode {
  switch (refusal.kind) {
    case "revoked":
      return "grant-missing";
    case "expired":
      return "grant-expired";
    case "market":
      return "permission-denied";
    case "price":
      return "price-limit";
    case "escrow":
      return "insufficient-funds";
    case "stake":
    case "daily":
      return "grant-update-required";
    case "positions":
      return "position-limit";
  }
}

export type XOrder = { ok: true; call: Call; quote: Quote } | { ok: false; code: XRefusalCode; why: string };

/**
 * One mention's order on one Window: exactly the stake it named (never resized up), quoted on the rested book, checked
 * against the grant as `placeFor` will check it at the worst the fill can charge — so a refusal is named here and
 * nothing is sent.
 */
export function xOrder(xv: Pick<XVenue, "vault">, input: { grant: VaultGrant; window: RunnerWindow; side: Side; stakeBase: bigint; book: YesBook | null; held: { up: bigint; down: bigint }; nowSec: number; nowMs: number }): XOrder {
  const { grant, window: w, side, stakeBase, book, held, nowSec, nowMs } = input;
  if (stakeBase > grant.budgetBase) return { ok: false, code: "insufficient-funds", why: "more than the X balance" };
  if (!book) return { ok: false, code: "quote-unavailable", why: "book unreadable" };
  const quote = quoteFromBook(book, w.grid, side, stakeBase, nowMs);
  if (!quote) return { ok: false, code: "no-liquidity", why: `nothing rests to fill ${stakeBase} of ${side.toUpperCase()}` };
  const verdict = simulateCaps({
    grant, nowSec, marketId: w.marketId as never, sidePriceRaw: ownTermsPriceRaw(quote.limitPriceRaw, side, w.grid.decimals), quantityRaw: quote.contractsRaw,
    spendBase: quote.maxCostBase, one: oneUnit(w.grid.decimals), opensNewPosition: held.up + held.down === 0n,
  });
  if (!verdict.ok) return { ok: false, code: capRefusalCode(verdict.refusal), why: `the grant refuses it (${verdict.refusal.kind})` };
  const expirySec = orderExpirySec(nowSec, { lockAtSec: w.lockAtSec, intervalSec: w.cadenceSec });
  if (expirySec === null) return { ok: false, code: "window-entry-closed", why: "inside the no-entry buffer before lock" };
  const call = placeForCall(xv.vault, { grantId: grant.grantId, marketId: w.marketId as Hex, outcomeIdx: side === "up" ? 0 : 1, isBuy: true, priceRaw: quote.limitPriceRaw, quantityRaw: quote.contractsRaw, expireNs: BigInt(expirySec) * NS });
  return { ok: true, call, quote };
}
