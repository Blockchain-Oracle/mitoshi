// Ported from Masayume 68f7a09:packages/markets/src/leverage/read.ts — on the Tempo read runtime; `params` carries D-174's
// `minRestSec` and `fairSlackRaw`; reads decode the guard's and verifier's errors (`LEVERAGE_READ_ABI`).
import { knockoutLine, leverageStatusOf, type LeverageMark, type LeverageParams, type LeveragePosition, type LeverageQuote, type LeverageReserveState } from "@cwf/core/leverage";
import { diagnosis, err, ok, OUTCOME_TO_SIDE, SIDE_TO_OUTCOME, toMarketId, USD_DECIMALS, type Address, type MarketId, type OutcomeIdx, type Reading, type Side } from "@cwf/core";
import type { PublicClient } from "viem";
import { nowMs } from "../runtime/clock";
import { withReading } from "../runtime/reading";
import { getPublicClient } from "../runtime/read-runtime";
import { leverageVenueOf } from "./deployment";
import { diagnoseLeverage, LEVERAGE_READ_ABI } from "./errors";

const PAGE = 50;
const MAX_POSITIONS = 500;
const BPS = 10_000n;

type PositionTuple = {
  owner: Address;
  status: number;
  outcomeIdx: number;
  leverageBps: number;
  marketId: `0x${string}`;
  openedAtSec: bigint;
  expirySec: bigint;
  exitedAtSec: bigint;
  quantityRaw: bigint;
  stake: bigint;
  fronted: bigint;
  premium: bigint;
  entryPriceRaw: bigint;
  proceeds: bigint;
  reclaimed: bigint;
  returned: bigint;
};

type PreviewTuple = { quantityRaw: bigint; costRaw: bigint; filledRaw: bigint; limitYesRaw: bigint; priceRaw: bigint; stake: bigint; fronted: bigint; premium: bigint; winIfRight: bigint };

/** The public `params` getter flattens the struct into a tuple, in declaration order. */
type ParamsTuple = readonly [number, number, number, number, bigint, bigint, bigint, bigint, number, number, number, bigint];

async function viemClient(): Promise<PublicClient> {
  return (await getPublicClient()) as unknown as PublicClient;
}

export async function reserveContract() {
  const client = await getPublicClient();
  const v = leverageVenueOf(client.chain.id);
  return v ? ({ address: v.leverageReserve, abi: LEVERAGE_READ_ABI } as const) : null;
}

export function toLeverageParams(p: ParamsTuple): LeverageParams {
  return {
    maxLeverageBps: p[0],
    premiumBps: p[1],
    maintenanceBps: p[2],
    maxExposureBps: p[3],
    minEntryPriceRaw: p[4],
    maxEntryPriceRaw: p[5],
    maxFrontedPerPositionBase: p[6],
    maxWindowFrontedBase: p[7],
    maxOpenPositions: p[8],
    minTimeLeftSec: p[9],
    minRestSec: Number(p[10]),
    fairSlackRaw: p[11],
  };
}

export function toLeveragePosition(positionId: bigint, p: PositionTuple): LeveragePosition {
  return {
    positionId,
    owner: p.owner.toLowerCase() as Address,
    status: leverageStatusOf(p.status),
    side: OUTCOME_TO_SIDE[p.outcomeIdx as OutcomeIdx],
    leverageBps: p.leverageBps,
    marketId: toMarketId(p.marketId),
    openedAtSec: Number(p.openedAtSec),
    expirySec: Number(p.expirySec),
    exitedAtSec: p.exitedAtSec === 0n ? null : Number(p.exitedAtSec),
    quantityRaw: p.quantityRaw,
    stakeBase: p.stake,
    frontedBase: p.fronted,
    premiumBase: p.premium,
    entryPriceRaw: p.entryPriceRaw,
    proceedsBase: p.proceeds,
    reclaimedBase: p.reclaimed,
    returnedBase: p.returned,
  };
}

/** The reserve's sheet and tunables in one multicall; null where no reserve is deployed. */
export async function getLeverageReserveState(): Promise<Reading<LeverageReserveState | null>> {
  return withReading("leverageReserve", async () => {
    const deployment = leverageVenueOf((await getPublicClient()).chain.id);
    const contract = await reserveContract();
    if (!deployment || !contract) return null;
    const [params, liquid, outstanding, supplyShares, paused, open] = await (await viemClient()).multicall({
      allowFailure: false,
      contracts: [
        { ...contract, functionName: "params" },
        { ...contract, functionName: "liquid" },
        { ...contract, functionName: "outstanding" },
        { ...contract, functionName: "supplyShares" },
        { ...contract, functionName: "paused" },
        { ...contract, functionName: "openPositions" },
      ],
    });
    const totalValueBase = liquid + outstanding;
    return {
      deployment: { chainId: deployment.chainId, leverageReserve: deployment.leverageReserve, fromBlock: deployment.fromBlock },
      params: toLeverageParams(params as ParamsTuple),
      liquidBase: liquid,
      outstandingBase: outstanding,
      totalValueBase,
      utilizationBps: totalValueBase === 0n ? 0 : Number((outstanding * BPS) / totalValueBase),
      supplyShares,
      paused,
      openPositions: open.length,
      decimals: USD_DECIMALS,
    };
  });
}

async function positionsByIds(ids: readonly bigint[]): Promise<LeveragePosition[]> {
  const contract = await reserveContract();
  if (!contract || ids.length === 0) return [];
  const rows = await (await viemClient()).multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ ...contract, functionName: "positionOf", args: [id] }) as const),
  });
  return ids.map((id, i) => toLeveragePosition(id, rows[i] as PositionTuple));
}

const STATUS_RANK = { live: 0, closed: 1, "knocked-out": 1, settled: 1 } as const;

/** One wallet's boosts: live first, then newest expiry; empty without a reserve. */
export async function listLeveragePositionsOf(wallet: Address): Promise<Reading<LeveragePosition[]>> {
  return withReading(`leverage:${wallet}`, async () => {
    const contract = await reserveContract();
    if (!contract) return [];
    const client = await viemClient();
    const total = Math.min(Number(await client.readContract({ ...contract, functionName: "positionCountOf", args: [wallet] })), MAX_POSITIONS);
    const ids: bigint[] = [];
    for (let offset = 0; offset < total; offset += PAGE) {
      const page = await client.readContract({ ...contract, functionName: "positionsOf", args: [wallet, BigInt(offset), BigInt(Math.min(PAGE, total - offset))] });
      ids.push(...(page as readonly bigint[]));
    }
    const positions = await positionsByIds(ids);
    return positions.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.expirySec - a.expirySec || Number(b.positionId - a.positionId));
  });
}

/** Every LIVE position on the reserve — what the keeper watches. */
export async function listLeverageOpenPositions(): Promise<Reading<LeveragePosition[]>> {
  return withReading("leverageOpen", async () => {
    const contract = await reserveContract();
    if (!contract) return [];
    const ids = await (await viemClient()).readContract({ ...contract, functionName: "openPositions" });
    return positionsByIds([...ids]);
  });
}

export async function getLeveragePosition(positionId: bigint): Promise<Reading<LeveragePosition | null>> {
  return withReading(`leveragePosition:${positionId}`, async () => (await positionsByIds([positionId]))[0] ?? null);
}

/** What the book would pay for a position right now, against its knock-out line. */
export async function getLeverageMark(positionId: bigint): Promise<Reading<LeverageMark>> {
  return withReading(`leverageMark:${positionId}`, async () => {
    const contract = await reserveContract();
    if (!contract) return { markBase: 0n, filledRaw: 0n, lineBase: 0n, knockable: false };
    const [markBase, filledRaw, lineBase, knockable] = await (await viemClient()).readContract({ ...contract, functionName: "markOf", args: [positionId] });
    return { markBase, filledRaw, lineBase, knockable };
  });
}

/** A supplier's shares and what they are worth of the reserve's total value right now. */
export async function getLeverageSharesOf(wallet: Address): Promise<Reading<{ shares: bigint; worthBase: bigint }>> {
  return withReading(`leverageShares:${wallet}`, async () => {
    const contract = await reserveContract();
    if (!contract) return { shares: 0n, worthBase: 0n };
    const [shares, supplyShares, totalValue] = await (await viemClient()).multicall({
      allowFailure: false,
      contracts: [
        { ...contract, functionName: "sharesOf", args: [wallet] },
        { ...contract, functionName: "supplyShares" },
        { ...contract, functionName: "totalValue" },
      ],
    });
    return { shares, worthBase: supplyShares === 0n ? 0n : (shares * totalValue) / supplyShares };
  });
}

function toQuote(side: Side, leverageBps: number, p: PreviewTuple, maintenanceBps: number): LeverageQuote {
  return {
    side,
    leverageBps,
    quantityRaw: p.quantityRaw,
    costBase: p.costRaw,
    limitYesRaw: p.limitYesRaw,
    priceRaw: p.priceRaw,
    stakeBase: p.stake,
    frontedBase: p.fronted,
    premiumBase: p.premium,
    winIfRightBase: p.winIfRight,
    lineBase: knockoutLine(p.fronted, maintenanceBps),
    decimals: USD_DECIMALS,
    quotedAtMs: nowMs(),
  };
}

/**
 * The contract's own answer for a boost (`previewOpen`): what `quantityRaw` of a side costs and yields at
 * `leverageBps` right now, priced off the venue's book inside the call. A refusal is the error arm with
 * the reserve's reason — never a stale last-good quote for a boost the reserve would not take.
 */
export async function previewLeverageOpen(marketId: MarketId, side: Side, quantityRaw: bigint, leverageBps: number, maintenanceBps: number): Promise<Reading<LeverageQuote>> {
  const contract = await reserveContract();
  if (!contract) return err(diagnosis("not-deployed", "LeverageReserve is not deployed on this network yet"));
  try {
    const p = await (await viemClient()).readContract({ ...contract, functionName: "previewOpen", args: [marketId as `0x${string}`, SIDE_TO_OUTCOME[side], quantityRaw, leverageBps] });
    return ok(toQuote(side, leverageBps, p as PreviewTuple, maintenanceBps), nowMs());
  } catch (error) {
    return err(diagnoseLeverage(error));
  }
}

/** The stake-first quote (`sizeForStake`): the size a stake affords off the live book, then that size priced. */
export async function sizeLeverageForStake(marketId: MarketId, side: Side, stakeBase: bigint, leverageBps: number, maintenanceBps: number): Promise<Reading<LeverageQuote>> {
  const contract = await reserveContract();
  if (!contract) return err(diagnosis("not-deployed", "LeverageReserve is not deployed on this network yet"));
  try {
    const p = await (await viemClient()).readContract({ ...contract, functionName: "sizeForStake", args: [marketId as `0x${string}`, SIDE_TO_OUTCOME[side], stakeBase, leverageBps] });
    return ok(toQuote(side, leverageBps, p as PreviewTuple, maintenanceBps), nowMs());
  } catch (error) {
    return err(diagnoseLeverage(error));
  }
}
