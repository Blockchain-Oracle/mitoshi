/**
 * The Earn maker vault's reads (S8 box 2; Masayume 68f7a09:packages/markets/src/maker/read.ts rebuilt on the Tempo read
 * runtime): the vault's own balance sheet (`liquid`, `totalDeployed`, `totalValue`, the share price, who quotes), the
 * Windows it is on and the last ones it settled — each with its book and inventory from the vault and its facts from
 * the lens in one round — and a supplier's shares with what they are worth today. Every figure is the contract's; a
 * network without the vault answers `null` inside the reading.
 */
import { zeroAddress, type Address, type Hex } from "viem";
import { marketMakerVaultAbi } from "@cwf/clients/abis/MarketMakerVault";
import { toMarketId, USD_DECIMALS, type EventMarket, type MarketId, type Reading } from "@cwf/core";
import { deployedOf, type MakerParams, type MakerVaultState, type MakerWindowView } from "@cwf/core/maker";
import { readWindows } from "../engine/lens";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { makerVenueOf } from "./deployment";

/** `params()` as viem returns the public struct getter: its fields in declaration order. */
export type MakerParamsTuple = readonly [number, bigint, bigint, bigint, bigint, bigint, number, number];

/** `bookOf(marketId)` as viem returns the struct. */
export interface BookTuple {
  escrowOut: bigint;
  escrowBack: bigint;
  merged: bigint;
  payout: bigint;
  realized: bigint;
  openedAtSec: bigint;
  settledAtSec: bigint;
  quoteCount: number;
  settled: boolean;
}

/** A Window the vault is on (or settled), with the lens' facts about it — null when the lens has no such Window. */
export interface MakerWindowRow {
  view: MakerWindowView;
  market: EventMarket | null;
  /** The engine has resolved or voided the Window, so the vault's `settle` can run (`MarketNotSettled` before that). */
  settleable: boolean;
}

/** The engine's `STATUS_RESOLVED` (4) and `STATUS_VOIDED` (5) — the two the earn-quoter settles on (`EngineTypes.sol`). */
export const isSettledStatus = (status: number): boolean => status === 4 || status === 5;

export interface MakerWindows {
  /** Quoted and not yet settled, soonest lock first. */
  open: MakerWindowRow[];
  /** Settled, newest first. */
  history: MakerWindowRow[];
}

export function toMakerParams(p: MakerParamsTuple): MakerParams {
  return {
    maxExposureBps: Number(p[0]),
    minSpreadRaw: p[1],
    minPriceRaw: p[2],
    maxPriceRaw: p[3],
    maxQuantityRaw: p[4],
    maxWindowDeployedBase: p[5],
    maxOpenWindows: Number(p[6]),
    minTimeLeftSec: Number(p[7]),
  };
}

/** The contract's book and inventory for one Window as the page reads it; `realized` is the contract's own booking. */
export function toMakerWindowView(marketId: MarketId, b: BookTuple, inventory: readonly [bigint, bigint]): MakerWindowView {
  const book = { escrowOutBase: b.escrowOut, escrowBackBase: b.escrowBack, mergedBase: b.merged, payoutBase: b.payout };
  return {
    marketId,
    ...book,
    openedAtSec: Number(b.openedAtSec),
    settledAtSec: b.settledAtSec === 0n ? null : Number(b.settledAtSec),
    quoteCount: Number(b.quoteCount),
    settled: b.settled,
    yesRaw: inventory[0],
    noRaw: inventory[1],
    deployedBase: deployedOf(book),
    realizedBase: b.settled ? b.realized : null,
  };
}

async function vault() {
  const client = await getPublicClient();
  const deployment = makerVenueOf(client.chain.id);
  const contract = deployment ? ({ address: deployment.marketMakerVault, abi: marketMakerVaultAbi } as const) : null;
  return { client, deployment, contract };
}

/** The vault's sheet and tunables in one multicall; `null` where no vault is deployed. */
export async function getMakerVaultState(): Promise<Reading<MakerVaultState | null>> {
  return withReading("makerVault", async () => {
    const { client, deployment, contract } = await vault();
    if (!deployment || !contract) return null;
    const [params, maker, paused, liquid, deployed, totalValue, sharePriceRaw, utilizationBps, supplyShares, open] = (await client.multicall({
      allowFailure: false,
      contracts: [
        { ...contract, functionName: "params" },
        { ...contract, functionName: "maker" },
        { ...contract, functionName: "paused" },
        { ...contract, functionName: "liquid" },
        { ...contract, functionName: "totalDeployed" },
        { ...contract, functionName: "totalValue" },
        { ...contract, functionName: "sharePriceRaw" },
        { ...contract, functionName: "utilizationBps" },
        { ...contract, functionName: "supplyShares" },
        { ...contract, functionName: "openWindows" },
      ],
    })) as unknown as [MakerParamsTuple, Address, boolean, bigint, bigint, bigint, bigint, bigint, bigint, readonly Hex[]];
    return {
      deployment,
      params: toMakerParams(params),
      maker: maker.toLowerCase() === zeroAddress ? null : maker,
      paused,
      liquidBase: liquid,
      deployedBase: deployed,
      totalValueBase: totalValue,
      sharePriceRaw,
      utilizationBps: Number(utilizationBps),
      supplyShares,
      openWindows: open.map((m) => toMarketId(m)),
      decimals: USD_DECIMALS,
    };
  });
}

async function viewsOf(ids: readonly MarketId[]): Promise<MakerWindowRow[]> {
  if (ids.length === 0) return [];
  const { client, contract } = await vault();
  if (!contract) return [];
  const [rows, facts] = await Promise.all([
    client.multicall({
      allowFailure: false,
      contracts: ids.flatMap((m) => [{ ...contract, functionName: "bookOf" as const, args: [m as Hex] as const }, { ...contract, functionName: "inventoryOf" as const, args: [m as Hex] as const }]),
    }) as Promise<unknown[]>,
    readWindows(ids),
  ]);
  return ids.map((marketId, i) => {
    const f = facts.get(marketId);
    return { view: toMakerWindowView(marketId, rows[2 * i] as BookTuple, rows[2 * i + 1] as readonly [bigint, bigint]), market: f?.market ?? null, settleable: f ? isSettledStatus(f.status) : false };
  });
}

/** The Windows the vault is on and the last `historyLimit` it settled, each with its lens facts; empty without a vault. */
export async function listMakerWindows(historyLimit = 10): Promise<Reading<MakerWindows>> {
  return withReading(`makerWindows:${historyLimit}`, async () => {
    const { client, contract } = await vault();
    if (!contract) return { open: [], history: [] };
    const [open, count] = (await client.multicall({ allowFailure: false, contracts: [{ ...contract, functionName: "openWindows" }, { ...contract, functionName: "windowCount" }] })) as unknown as [readonly Hex[], bigint];
    // The history is every Window ever quoted, oldest first: the open ones sit at its tail, so read a page wide enough
    // to hold them and the settled ones wanted.
    const want = BigInt(historyLimit) + BigInt(open.length);
    const offset = count > want ? count - want : 0n;
    const page = count === 0n ? [] : ((await client.readContract({ ...contract, functionName: "windowsAt", args: [offset, want] })) as readonly Hex[]);
    const openSet = new Set(open.map((m) => m.toLowerCase()));
    const settledIds = [...page].reverse().filter((m) => !openSet.has(m.toLowerCase())).slice(0, historyLimit).map((m) => toMarketId(m));
    const rows = await viewsOf([...open.map((m) => toMarketId(m)), ...settledIds]);
    const openRows = rows.slice(0, open.length).sort((a, b) => (a.market?.lockAtSec ?? 0) - (b.market?.lockAtSec ?? 0));
    return { open: openRows, history: rows.slice(open.length).filter((r) => r.view.settled) };
  });
}

/** A supplier's shares and what they are worth of the vault's total value right now; zeros without a vault. */
export async function getMakerSharesOf(wallet: Address): Promise<Reading<{ shares: bigint; worthBase: bigint }>> {
  return withReading(`makerShares:${wallet.toLowerCase()}`, async () => {
    const { client, contract } = await vault();
    if (!contract) return { shares: 0n, worthBase: 0n };
    const [shares, supplyShares, totalValue] = (await client.multicall({
      allowFailure: false,
      contracts: [{ ...contract, functionName: "sharesOf", args: [wallet] }, { ...contract, functionName: "supplyShares" }, { ...contract, functionName: "totalValue" }],
    })) as unknown as [bigint, bigint, bigint];
    return { shares, worthBase: supplyShares === 0n ? 0n : (shares * totalValue) / supplyShares };
  });
}

/** Whether the engine has resolved or voided one Window, so the vault's `settle` would land rather than revert. */
export async function isMakerWindowSettleable(marketId: MarketId): Promise<Reading<boolean>> {
  return withReading(`makerSettleable:${marketId}`, async () => {
    const f = (await readWindows([marketId])).get(marketId);
    return f ? isSettledStatus(f.status) : false;
  });
}

/** The closed Window a withdraw would be refused on (`UnsettledWindow`), or null when every expired Window is settled. */
export async function getMakerUnsettledExpired(): Promise<Reading<MarketId | null>> {
  return withReading("makerUnsettled", async () => {
    const { client, contract } = await vault();
    if (!contract) return null;
    const stale = (await client.readContract({ ...contract, functionName: "unsettledExpired" })) as Hex;
    return /^0x0{64}$/.test(stale) ? null : toMarketId(stale);
  });
}
