/**
 * The arena on the chain, read (R4-9, D-227; ported from Masayume 68f7a09:packages/markets/src/games/read.ts onto the
 * Tempo read runtime): its tunables and tiers, one match whole (record, revealed deck, both seats' picks, running PnL),
 * a pick's quote off the live book (`sizeForStake`, the walk `placePick` makes), a wallet's credit and a seat's key.
 */
import { arenaStatusOf, cardsInMask, pickOf as pickFromIndex, type ArenaAgent, type ArenaDeployment, type ArenaMatch, type ArenaParams, type ArenaPick, type ArenaQuote, type ArenaTier, type Pick, type Seat } from "@cwf/core/games";
import { toMarketId, type Address, type Bytes32, type MarketId, type Reading } from "@cwf/core";
import { zeroAddress, type PublicClient } from "viem";
import { gameArenaAbi } from "@cwf/clients/abis/GameArena";
import { withReading } from "../runtime/reading";
import { getPublicClient } from "../runtime/read-runtime";
import { arenaOf } from "./deployment";

/** The public `params` getter flattens the struct into a tuple, in declaration order. */
type ParamsTuple = readonly [number, number, number, number, number, number];
type TierTuple = readonly [bigint, bigint, boolean];

interface MatchTuple {
  creator: Address;
  tier: number;
  status: number;
  deckSize: number;
  pickedMask0: number;
  challenger: Address;
  pickedMask1: number;
  settledMask: number;
  policyVersion: number;
  deckHash: `0x${string}`;
  createdAtSec: bigint;
  joinedAtSec: bigint;
  revealedAtSec: bigint;
  pickDeadlineSec: bigint;
  potBase: bigint;
  perCardCapBase: bigint;
}

interface PickTuple {
  placed: boolean;
  settled: boolean;
  outcomeIdx: number;
  quantity: bigint;
  costBase: bigint;
  payoutBase: bigint;
}

/** One match as the chain holds it: the record, the revealed deck, both seats' picks and the running PnL. */
export interface ArenaMatchView {
  match: ArenaMatch;
  cards: readonly MarketId[];
  picks: readonly ArenaPick[];
  creatorPnlBase: bigint;
  challengerPnlBase: bigint;
}

/** The arena's tunables, its priced tiers and whether it is taking new matches. */
export interface ArenaState {
  deployment: ArenaDeployment;
  params: ArenaParams;
  tiers: readonly ArenaTier[];
  paused: boolean;
  escrowedBase: bigint;
  creditedBase: bigint;
}

/** Core `STAKE_TIERS` has four; the arena prices the same four by index. */
const TIER_COUNT = 4;

async function viemClient(): Promise<PublicClient> {
  return (await getPublicClient()) as unknown as PublicClient;
}

async function arena(): Promise<{ deployment: ArenaDeployment; contract: { address: Address; abi: typeof gameArenaAbi } } | null> {
  const deployment = arenaOf((await getPublicClient()).chain.id);
  return deployment ? { deployment, contract: { address: deployment.gameArena, abi: gameArenaAbi } } : null;
}

export function toArenaParams(p: ParamsTuple): ArenaParams {
  return { joinWindowSec: p[0], revealWindowSec: p[1], pickWindowSec: p[2], minDeckSize: p[3], maxDeckSize: p[4], minCardLifeSec: p[5] };
}

export function toArenaMatch(matchId: Bytes32, m: MatchTuple): ArenaMatch {
  return {
    matchId,
    creator: m.creator.toLowerCase() as Address,
    challenger: m.challenger.toLowerCase() as Address,
    tier: m.tier,
    status: arenaStatusOf(m.status),
    deckSize: m.deckSize,
    pickedMask0: m.pickedMask0,
    pickedMask1: m.pickedMask1,
    settledMask: m.settledMask,
    policyVersion: m.policyVersion,
    deckHash: m.deckHash as Bytes32,
    createdAtSec: Number(m.createdAtSec),
    joinedAtSec: Number(m.joinedAtSec),
    revealedAtSec: Number(m.revealedAtSec),
    pickDeadlineSec: Number(m.pickDeadlineSec),
    potBase: m.potBase,
    perCardCapBase: m.perCardCapBase,
  };
}

function toArenaPick(cardIndex: number, seat: Seat, p: PickTuple): ArenaPick {
  return { cardIndex, seat, placed: p.placed, settled: p.settled, pick: pickFromIndex(p.outcomeIdx), quantity: p.quantity, costBase: p.costBase, payoutBase: p.payoutBase };
}

/** The arena's sheet and tunables; null where no arena is deployed. */
export async function getArenaState(): Promise<Reading<ArenaState | null>> {
  return withReading("gameArena", async () => {
    const a = await arena();
    if (!a) return null;
    const client = await viemClient();
    const [params, paused, escrowed, credited] = await client.multicall({
      allowFailure: false,
      contracts: [
        { ...a.contract, functionName: "params" },
        { ...a.contract, functionName: "paused" },
        { ...a.contract, functionName: "escrowed" },
        { ...a.contract, functionName: "credited" },
      ],
    });
    const tiers = await client.multicall({
      allowFailure: false,
      contracts: Array.from({ length: TIER_COUNT }, (_, i) => ({ ...a.contract, functionName: "tierOf", args: [i] }) as const),
    });
    return {
      deployment: a.deployment,
      params: toArenaParams(params as unknown as ParamsTuple),
      paused: paused as boolean,
      escrowedBase: escrowed as bigint,
      creditedBase: credited as bigint,
      tiers: (tiers as unknown as readonly TierTuple[]).map((t, tier) => ({ tier, potBase: t[0], perCardCapBase: t[1], enabled: t[2] })),
    };
  });
}

/** One match, whole; null when the arena never recorded it. The deck size comes from the record, so picks are a second round trip. */
export async function getArenaMatch(matchId: Bytes32): Promise<Reading<ArenaMatchView | null>> {
  return withReading(`arenaMatch:${matchId}`, async () => {
    const a = await arena();
    if (!a) return null;
    const client = await viemClient();
    const [record, deck, pnl] = await client.multicall({
      allowFailure: false,
      contracts: [
        { ...a.contract, functionName: "matchOf", args: [matchId] },
        { ...a.contract, functionName: "deckOf", args: [matchId] },
        { ...a.contract, functionName: "pnlOf", args: [matchId] },
      ],
    });
    const m = record as unknown as MatchTuple;
    if (m.creator === zeroAddress) return null;
    const match = toArenaMatch(matchId, m);
    const slots: { cardIndex: number; seat: Seat }[] = [];
    for (let cardIndex = 0; cardIndex < match.deckSize; cardIndex += 1) slots.push({ cardIndex, seat: 0 }, { cardIndex, seat: 1 });
    const rows = slots.length
      ? await client.multicall({ allowFailure: false, contracts: slots.map(({ cardIndex, seat }) => ({ ...a.contract, functionName: "pickOf", args: [matchId, cardIndex, seat] }) as const) })
      : [];
    const [creatorPnlBase, challengerPnlBase] = pnl as unknown as readonly [bigint, bigint];
    return {
      match,
      cards: (deck as unknown as readonly `0x${string}`[]).map(toMarketId),
      picks: slots.map((slot, i) => toArenaPick(slot.cardIndex, slot.seat, rows[i] as unknown as PickTuple)).filter((p) => p.placed),
      creatorPnlBase,
      challengerPnlBase,
    };
  });
}

/** What a stake buys on one side of one card right now — the same walk `placePick` will make. */
export async function quoteArenaPick(marketId: MarketId, pick: Pick, stakeBase: bigint): Promise<Reading<ArenaQuote | null>> {
  return withReading(`arenaQuote:${marketId}:${pick}:${stakeBase}`, async () => {
    const a = await arena();
    if (!a) return null;
    const q = await (await viemClient()).readContract({ ...a.contract, functionName: "sizeForStake", args: [marketId, pick === "up" ? 0 : 1, stakeBase] });
    return q as unknown as ArenaQuote;
  });
}

/** What the arena owes one wallet: card payouts and pots alike, waiting on a pull. */
export async function getArenaCredit(wallet: Address): Promise<Reading<bigint>> {
  return withReading(`arenaCredit:${wallet}`, async () => {
    const a = await arena();
    if (!a) return 0n;
    return (await (await viemClient()).readContract({ ...a.contract, functionName: "creditOf", args: [wallet] })) as bigint;
  });
}

/** The key a seat has named for this match, or null when none is live. */
export async function readArenaAgent(matchId: Bytes32, player: Address): Promise<Reading<ArenaAgent | null>> {
  return withReading(`arenaAgent:${matchId}:${player}`, async () => {
    const a = await arena();
    if (!a) return null;
    const g = (await (await viemClient()).readContract({ ...a.contract, functionName: "agentOf", args: [matchId, player] })) as unknown as { agent: Address; expiresAtSec: bigint; budgetBase: bigint; spentBase: bigint };
    if (g.agent === zeroAddress) return null;
    return { agent: g.agent.toLowerCase() as Address, expiresAtSec: Number(g.expiresAtSec), budgetBase: g.budgetBase, spentBase: g.spentBase };
  });
}

/** The cards a seat still owes, straight off the chain's own completion mask. */
export function cardsOutstanding(match: ArenaMatch, seat: Seat): readonly number[] {
  const mask = seat === 0 ? match.pickedMask0 : match.pickedMask1;
  return cardsInMask((1 << match.deckSize) - 1, match.deckSize).filter((i) => ((mask >> i) & 1) === 0);
}
