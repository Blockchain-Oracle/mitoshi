/**
 * The exit keeper's chain side (S24.3, D-193): what the current Trading Balance (`EventVaultV2`) holds for an owner on a
 * Window, the Window and its book, the owner's live EXIT grant, the grant's floor at a signed RedStone spot, and the
 * `exitFor` sale. The contract decides the lowest price — `exitFloorRaw` is the fair value at the proof less the owner's
 * tolerance, and a sale whose limit sits under it reverts (`BelowFairFloor`) — so the keeper's limit is that floor
 * rounded *up* onto the tick grid: an IOC there takes every bid at or above it, at the bids' own prices.
 */
import { decodeFunctionResult, encodeFunctionData, getAddress, parseEventLogs, type Address, type Hex, type Log } from "viem";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { GRANT_KIND_INDEX, USD_DECIMALS, type Side } from "@cwf/core";
import { deploymentOf } from "../deployments";
import { PAIR_TICKS, yesTicksOf } from "../engine/calls";
import { BOOK_LEVELS, levelsCall, TAKER_MIN_REST_SEC, zipLevels, type LevelsAnswer } from "../engine/lens";
import { sellLevels, type Grid, type YesBook } from "../engine/quote";
import { feedIdToAscii } from "../prices/redstone";
import type { Call } from "../tx/batch";
import { toVaultGrant, vaultOutcomeId, type GrantTuple } from "../vault/read";
import type { OpsClient } from "./client";
import type { Venue } from "./venue";

export interface ExitVenue {
  vault: Address;
  /** The FairValueGuard the vault's floor reads. */
  guard: Address;
  lens: Address;
}

/** The current Trading Balance (v2) and its guard; null where v2 is not deployed. */
export async function exitVenueOf(client: OpsClient, venue: Venue): Promise<ExitVenue | null> {
  const v2 = deploymentOf("vault2", client.chainId)?.EventVaultV2;
  if (!v2) return null;
  const vault = getAddress(v2.address);
  const guard = (await client.public.readContract({ address: vault, abi: eventVaultV2Abi, functionName: "fairGuard" })) as Address;
  return { vault, guard, lens: venue.lens };
}

export interface ExitWindow {
  marketId: Hex;
  /** Trading now (`STATUS_TRADING`, still open): a sale can only land then. */
  trading: boolean;
  lockAtSec: number;
  ticker: number;
  grid: Grid;
}

export interface ExitTarget {
  owner: Address;
  marketId: Hex;
  side: Side;
}

export interface ExitRead {
  heldRaw: bigint;
  window: ExitWindow | null;
  /** Read only for the targets that asked for it (a take-profit or stop-loss reads what Close pays). */
  book: YesBook | null;
}

const STATUS_TRADING = 1;
const sideIdx = (side: Side): 0 | 1 => (side === "up" ? 0 : 1);

/** Holdings for every target, each Window once, and the books asked for — one multicall. */
export async function readExitTargets(client: OpsClient, ev: ExitVenue, targets: readonly ExitTarget[], wantsBook: (t: ExitTarget, i: number) => boolean): Promise<ExitRead[]> {
  if (targets.length === 0) return [];
  const markets = [...new Set(targets.map((t) => t.marketId.toLowerCase() as Hex))];
  const booked = new Set(targets.filter(wantsBook).map((t) => t.marketId.toLowerCase()));
  const lens = { address: ev.lens, abi: engineLensAbi } as const;
  const contracts = [
    ...markets.map((m) => ({ ...lens, functionName: "marketRef" as const, args: [m] as const })),
    ...markets.filter((m) => booked.has(m)).flatMap((m) => [levelsCall(ev.lens, m as never, true, BOOK_LEVELS, TAKER_MIN_REST_SEC), levelsCall(ev.lens, m as never, false, BOOK_LEVELS, TAKER_MIN_REST_SEC)]),
    ...targets.map((t) => ({ address: ev.vault, abi: eventVaultV2Abi, functionName: "positionOf" as const, args: [t.owner, vaultOutcomeId(t.marketId, sideIdx(t.side))] as const })),
  ];
  const res = (await client.public.multicall({ contracts: contracts as never, allowFailure: true })) as unknown as { status: "success" | "failure"; result?: unknown; error?: unknown }[];
  const windows = new Map<string, ExitWindow | null>();
  markets.forEach((m, i) => {
    const r = res[i]!;
    if (r.status !== "success") return void windows.set(m, null);
    const ref = r.result as unknown as Record<string, bigint | number | string>;
    const lotBase = BigInt(ref.lotBase!);
    windows.set(m, {
      marketId: m, trading: Number(ref.status) === STATUS_TRADING && Number(ref.state) === 0, lockAtSec: Number(ref.lockAt), ticker: Number(ref.ticker),
      grid: { lotBase, tickBase: BigInt(ref.tickBase!), cashUnit: lotBase / BigInt(PAIR_TICKS), minLots: BigInt(ref.minLots!), decimals: USD_DECIMALS },
    });
  });
  const books = new Map<string, YesBook | null>();
  let at = markets.length;
  for (const m of markets.filter((x) => booked.has(x))) {
    const [bids, asks] = [res[at++]!, res[at++]!];
    books.set(m, bids.status === "success" && asks.status === "success" ? { bids: zipLevels(bids.result as unknown as LevelsAnswer), asks: zipLevels(asks.result as unknown as LevelsAnswer) } : null);
  }
  return targets.map((t, i) => {
    const r = res[at + i]!;
    const m = t.marketId.toLowerCase();
    if (r.status !== "success") throw new Error(`positionOf ${t.owner} on ${m} not read: ${String(r.error).split("\n")[0]}`);
    return { heldRaw: r.result as bigint, window: windows.get(m) ?? null, book: books.get(m) ?? null };
  });
}

export interface ExitGrantView {
  grantId: bigint;
  /** Null when the grant may sell for this keeper now; else why not, in words. */
  why: string | null;
  /** The Window the grant is scoped to, or null for any. */
  market: Hex | null;
  toleranceBps: number;
}

/** Each owner's live EXIT grant on v2 and whether it names `keeper` now; an owner with none is absent. */
export async function readExitGrants(client: OpsClient, ev: ExitVenue, owners: readonly Address[], keeper: Address, nowSec: number): Promise<Map<string, ExitGrantView>> {
  const out = new Map<string, ExitGrantView>();
  const unique = [...new Set(owners.map((o) => o.toLowerCase() as Address))];
  if (unique.length === 0) return out;
  const vault = { address: ev.vault, abi: eventVaultV2Abi } as const;
  const ids = (await client.public.multicall({ contracts: unique.map((o) => ({ ...vault, functionName: "activeGrantOf" as const, args: [o, GRANT_KIND_INDEX.exit] as const })), allowFailure: false })) as bigint[];
  const live = unique.map((owner, i) => ({ owner, id: ids[i]! })).filter((g) => g.id !== 0n);
  if (live.length === 0) return out;
  const rows = (await client.public.multicall({
    contracts: live.flatMap(({ id }) => [{ ...vault, functionName: "grantOf" as const, args: [id] as const }, { ...vault, functionName: "exitToleranceBps" as const, args: [id] as const }]),
    allowFailure: false,
  })) as unknown[];
  live.forEach(({ owner, id }, i) => {
    const g = toVaultGrant(id, rows[2 * i] as GrantTuple);
    const why = g.revoked ? "the EXIT grant was revoked" : g.expiresAtSec < nowSec ? "the EXIT grant expired" : g.actor.toLowerCase() !== keeper.toLowerCase() ? "the EXIT grant names another keeper" : null;
    out.set(owner, { grantId: id, why, market: g.caps.market, toleranceBps: Number(rows[2 * i + 1]) });
  });
  return out;
}

/** The RedStone feed the guard verifies for a ticker, or null when it has none (`spotSourceOf`). */
export async function guardFeedOf(client: OpsClient, guard: Address, ticker: number): Promise<string | null> {
  const [verifier, feedId] = (await client.public.readContract({ address: guard, abi: fairValueGuardAbi, functionName: "spotSourceOf", args: [ticker] })) as readonly [Address, Hex];
  return verifier === "0x0000000000000000000000000000000000000000" ? null : feedIdToAscii(feedId);
}

/**
 * The lowest own-terms side price the grant may sell at (per collateral unit), at the signed spot in `proof`. An
 * `eth_call`, not a view: the guard verifies the proof. Throws the guard's refusal (`SigmaNotSet`, `OpenPrintMissing`,
 * `NoSpotSource`) for the caller to name.
 */
export async function readExitFloorRaw(client: OpsClient, ev: ExitVenue, grantId: bigint, marketId: Hex, side: Side, proof: Hex): Promise<bigint> {
  const data = encodeFunctionData({ abi: eventVaultV2Abi, functionName: "exitFloorRaw", args: [grantId, marketId, sideIdx(side), proof] });
  const r = await client.public.call({ account: client.address ?? undefined, to: ev.vault, data });
  return decodeFunctionResult({ abi: eventVaultV2Abi, functionName: "exitFloorRaw", data: r.data ?? "0x" }) as bigint;
}

/** The sale's limit in own ticks: the floor rounded up onto the grid, never under it; null when nothing can sell (≥ 100%). */
export function exitLimitOwnTicks(floorRaw: bigint, tickBase: bigint): number | null {
  const ticks = (floorRaw + tickBase - 1n) / tickBase;
  if (ticks >= BigInt(PAIR_TICKS)) return null;
  return ticks < 1n ? 1 : Number(ticks);
}

/** The lots resting at or above `ownTicks` that a sale of `side` would hit. */
export function lotsAtOrAbove(book: YesBook, side: Side, ownTicks: number): bigint {
  return sellLevels(book, side).reduce((sum, [price, lots]) => (price >= ownTicks ? sum + lots : sum), 0n);
}

export interface ExitForArgs {
  grantId: bigint;
  marketId: Hex;
  side: Side;
  ownTicks: number;
  tickBase: bigint;
  quantityRaw: bigint;
  expireNs: bigint;
  proof: Hex;
}

/** `exitFor` — an IOC sale at `ownTicks` (sent in YES terms, as `place`) of the owner's held contracts. */
export const exitForCall = (vault: Address, a: ExitForArgs): Call => ({
  to: vault,
  data: encodeFunctionData({ abi: eventVaultV2Abi, functionName: "exitFor", args: [a.grantId, a.marketId, sideIdx(a.side), BigInt(yesTicksOf(a.side, a.ownTicks)) * a.tickBase, a.quantityRaw, a.expireNs, a.proof] }),
});

/**
 * The sale as the vault booked it (`Executed`, sell, under the grant — any grant for `null`, a restart's recovery):
 * contracts given up and the cash the owner got.
 */
export function exitBooked(logs: readonly Log[], vault: Address, owner: Address, marketId: Hex, grantId: bigint | null): { proceedsBase: bigint; contractsRaw: bigint } | null {
  const sale = parseEventLogs({ abi: eventVaultV2Abi, eventName: "Executed", logs: logs as Log[] }).find(
    (l) => l.address.toLowerCase() === vault.toLowerCase() && l.args.owner.toLowerCase() === owner.toLowerCase() && l.args.marketId.toLowerCase() === marketId.toLowerCase() && (grantId === null || l.args.grantId === grantId) && !l.args.isBuy,
  );
  return sale && sale.args.tokenDelta > 0n ? { proceedsBase: sale.args.cashDelta, contractsRaw: sale.args.tokenDelta } : null;
}
