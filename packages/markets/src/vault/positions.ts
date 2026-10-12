// Ported from Masayume 68f7a09:packages/markets/src/vault/history.ts (`listVaultTallies`, `tallyToLedger`,
// `vaultRound`) and web/src/features/vault/useVaultOpenBets.ts — the vault's own per-owner tallies (VaultTally, kept
// as-is, D-003) read head-fresh, joined with the lens Windows. D-227: what a held position cost is the tally's when that
// is exact (one side, never sold from), else the Window's own `Executed` fills replayed at average cost.
/**
 * What the owner's Trading Balance holds and held, Window by Window (the vault trades as itself, so none of it shows in
 * the wallet's engine positions): the recent Windows it traded through the vault (`marketsOf`, newest last), each with
 * its tally (`tallyOf`), the live holdings (`positionOf`) and the Window. And the verdict pinned to a vault call
 * (D-048 for the Trading Balance): call → settling → stamped → paid **into the Trading Balance**, whoever cranked
 * (`Settled.by` ≠ owner = paid automatically by the settler).
 */
import { getAbiItem, type Address } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { deriveVerdict, pooledOpenCost, replayVaultCost, tallyOpenCost, toMarketId, type MarketId, type PinnedVerdictView, type SideCosts, type VaultBet, type VaultDeployment, type VaultFill } from "@cwf/core";
import { readWindows, type WindowFacts } from "../engine/lens";
import { getLogClient, getPublicClient } from "../runtime/read-runtime";
import { nowSec } from "../runtime/clock";
import { LOG_WINDOW, DEFAULT_LOOKBACK_BLOCKS } from "../provider/chain-logs";
import { withReading } from "../runtime/reading";
import { vaultDeploymentsOf, vaultOutcomeId } from "./read";

type Tally = readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, number];

const tallyOf = (t: Tally) => ({ costBase: t[0], proceedsBase: t[1], payoutBase: t[2], boughtUp: t[3], boughtDown: t[4], soldUp: t[5], soldDown: t[6], firstAtSec: Number(t[7]), lastAtSec: Number(t[8]), settledAtSec: Number(t[9]), fills: t[10] });

/** Every Trading Balance on the chain (S24.2: v2, then v1 for what it still holds), each with its contract. */
async function vaultCtxs() {
  const client = await getPublicClient();
  return { client, all: vaultDeploymentsOf(client.chain.id).map((d) => ({ d, contract: { address: d.eventVault, abi: eventVaultAbi } as const })) };
}

/** The owner's `recent` latest vault Windows across every Trading Balance (newest first), each naming its vault. */
export async function listVaultBets(owner: Address, recent = 24): Promise<VaultBet[]> {
  const { client, all } = await vaultCtxs();
  const lists = await Promise.all(all.map(({ d, contract }) => listBetsIn(client, d, contract, owner, recent)));
  return lists.flat().sort((a, b) => b.lastAtSec - a.lastAtSec);
}

const EXECUTED = getAbiItem({ abi: eventVaultAbi, name: "Executed" });
/** Replayed costs by vault, owner, Window and fill count: a new fill changes the count, so an entry never goes stale. */
const replayed = new Map<string, SideCosts>();

/** The owner's fills on one Window through vault `d`, oldest first (newest log window first until `fills` are found). */
async function vaultFills(owner: Address, marketId: MarketId, d: VaultDeployment, fills: number): Promise<VaultFill[]> {
  const client = await getLogClient();
  const head = await client.getBlockNumber();
  const floor = head > DEFAULT_LOOKBACK_BLOCKS ? head - DEFAULT_LOOKBACK_BLOCKS : 0n;
  const out: VaultFill[] = [];
  for (let end = head; end >= (floor > d.fromBlock ? floor : d.fromBlock) && out.length < fills; end -= LOG_WINDOW) {
    const start = end - LOG_WINDOW + 1n > d.fromBlock ? end - LOG_WINDOW + 1n : d.fromBlock;
    const logs = await client.getLogs({ address: d.eventVault, event: EXECUTED, args: { owner, marketId }, fromBlock: start, toBlock: end });
    const page = logs.map((l) => {
      const a = l.args as { outcomeIdx: number; isBuy: boolean; cashDelta: bigint; tokenDelta: bigint };
      return { outcomeIdx: (a.outcomeIdx === 0 ? 0 : 1) as 0 | 1, isBuy: a.isBuy, cashBase: a.cashDelta, tokenRaw: a.tokenDelta };
    });
    out.unshift(...page);
    if (start === d.fromBlock) break;
  }
  return out;
}

/**
 * What the held contracts cost per side: the tally alone when exact, else the fills replayed (cached by fill count) —
 * provided the replay ends holding what the vault holds; otherwise the tally's average (a fill past the lookback).
 */
async function openCostOf(owner: Address, marketId: MarketId, d: VaultDeployment, t: ReturnType<typeof tallyOf>, held: { upRaw: bigint; downRaw: bigint }): Promise<SideCosts> {
  const counts = { costBase: t.costBase, boughtUpRaw: t.boughtUp, boughtDownRaw: t.boughtDown, soldUpRaw: t.soldUp, soldDownRaw: t.soldDown };
  if (held.upRaw + held.downRaw === 0n) return { upBase: 0n, downBase: 0n };
  const exact = tallyOpenCost(counts);
  if (exact) return exact;
  const key = `${d.eventVault}:${owner}:${marketId}:${t.fills}`.toLowerCase();
  const cached = replayed.get(key);
  if (cached) return cached;
  try {
    const r = replayVaultCost(await vaultFills(owner, marketId, d, t.fills));
    if (r.upRaw === held.upRaw && r.downRaw === held.downRaw) {
      const costs = { upBase: r.upBase, downBase: r.downBase };
      replayed.set(key, costs);
      return costs;
    }
  } catch {
    // The log read failed: the tally's average below, and the next poll tries again.
  }
  return pooledOpenCost(counts, held);
}

async function listBetsIn(client: Awaited<ReturnType<typeof getPublicClient>>, d: VaultDeployment, contract: { address: Address; abi: typeof eventVaultAbi }, owner: Address, recent: number): Promise<VaultBet[]> {
  const count = (await client.readContract({ ...contract, functionName: "marketCountOf", args: [owner] })) as bigint;
  if (count === 0n) return [];
  const offset = count > BigInt(recent) ? count - BigInt(recent) : 0n;
  const ids = ((await client.readContract({ ...contract, functionName: "marketsOf", args: [owner, offset, BigInt(recent)] })) as readonly `0x${string}`[]).map((id) => toMarketId(id));
  const reads = ids.flatMap((id) => [
    { ...contract, functionName: "tallyOf" as const, args: [owner, id] as const },
    { ...contract, functionName: "positionOf" as const, args: [owner, vaultOutcomeId(id, 0)] as const },
    { ...contract, functionName: "positionOf" as const, args: [owner, vaultOutcomeId(id, 1)] as const },
  ]);
  const [rows, windows] = await Promise.all([client.multicall({ allowFailure: false, contracts: reads as never }) as Promise<unknown[]>, readWindows(ids)]);
  const out = await Promise.all(
    ids.map(async (id, i): Promise<VaultBet | null> => {
      const w = windows.get(id);
      if (!w) return null;
      const t = tallyOf(rows[3 * i] as Tally);
      const held = { upRaw: rows[3 * i + 1] as bigint, downRaw: rows[3 * i + 2] as bigint };
      const cost = w.snapshot.state === "open" ? await openCostOf(owner, id, d, t, held) : { upBase: 0n, downBase: 0n };
      return {
        vault: contract.address,
        marketId: id, asset: w.market.asset, intervalSec: w.market.intervalSec, expirySec: w.market.expirySec, lockAtSec: w.market.lockAtSec, decimals: w.market.decimals,
        state: w.snapshot.state, winningOutcome: w.market.winningOutcome, resolvedAtMs: w.market.resolvedAtMs, upRaw: held.upRaw, downRaw: held.downRaw, costBase: t.costBase, proceedsBase: t.proceedsBase,
        payoutBase: t.payoutBase, settledAtSec: t.settledAtSec, lastAtSec: t.lastAtSec, firstAtSec: t.firstAtSec,
        boughtUpRaw: t.boughtUp, boughtDownRaw: t.boughtDown, soldUpRaw: t.soldUp, soldDownRaw: t.soldDown, costUpBase: cost.upBase, costDownBase: cost.downBase,
      };
    }),
  );
  return out.filter((b): b is VaultBet => b !== null).reverse();
}

const SETTLED = getAbiItem({ abi: eventVaultAbi, name: "Settled" });

/** The crank that paid this owner's Window on vault `d`, if any (owner and Window are indexed): its transaction and who sent it. */
async function settledEvent(owner: Address, marketId: MarketId, d: VaultDeployment): Promise<{ txHash: `0x${string}`; by: Address; payout: bigint } | null> {
  const client = await getLogClient();
  const head = await client.getBlockNumber();
  const floor = head > DEFAULT_LOOKBACK_BLOCKS ? head - DEFAULT_LOOKBACK_BLOCKS : 0n;
  // Newest first: a crank lands minutes after the close, so the latest window almost always has it.
  for (let end = head; end >= (floor > d.fromBlock ? floor : d.fromBlock); end -= LOG_WINDOW) {
    const start = end - LOG_WINDOW + 1n > d.fromBlock ? end - LOG_WINDOW + 1n : d.fromBlock;
    const logs = await client.getLogs({ address: d.eventVault, event: SETTLED, args: { owner, marketId }, fromBlock: start, toBlock: end });
    const last = logs.at(-1);
    if (last) {
      const a = last.args as { by: Address; payout: bigint };
      return { txHash: last.transactionHash!, by: a.by, payout: a.payout };
    }
    if (start === d.fromBlock) break;
  }
  return null;
}

/** The vault call's pinned verdict, or null when the owner never traded this Window through the vault. */
export async function readVaultVerdict(owner: Address, marketId: MarketId): Promise<PinnedVerdictView | null> {
  const { client, all } = await vaultCtxs();
  if (all.length === 0) return null;
  // The Window was traded through one vault (the current one, or v1 before the move): the first with fills on it.
  const [raws, windows] = await Promise.all([Promise.all(all.map(({ contract }) => client.readContract({ ...contract, functionName: "tallyOf", args: [owner, marketId] }) as Promise<Tally>)), readWindows([marketId])]);
  const at = raws.findIndex((r) => tallyOf(r).fills > 0);
  if (at < 0) return null;
  const t = tallyOf(raws[at]!);
  const d = all[at]!.d;
  const w: WindowFacts | undefined = windows.get(marketId);
  if (!w) return null;
  const holdings = { upRaw: t.boughtUp - t.soldUp, downRaw: t.boughtDown - t.soldDown };
  if (holdings.upRaw + holdings.downRaw === 0n && t.settledAtSec === 0) return null; // sold out before the close
  const base = { verdict: null, paidBy: null, paidBase: null, txHash: null, into: "trading-balance" as const };
  if (w.snapshot.state === "open") return { ...base, phase: nowSec() < w.snapshot.lockAtSec ? "call" : "settling" };
  const verdict = deriveVerdict({
    marketId, settlement: w.snapshot, holdings, feeBps: 0, decimals: w.market.decimals, costBasisBase: t.costBase - t.proceedsBase, settledAtMs: w.market.resolvedAtMs,
  });
  if (t.settledAtSec === 0) return { ...base, phase: "stamped", verdict };
  if (verdict?.outcome === "loss") return { ...base, phase: "stamped", verdict };
  const settled = await settledEvent(owner, marketId, d);
  return { ...base, phase: "paid", verdict, paidBy: settled && settled.by.toLowerCase() === owner.toLowerCase() ? "self" : "auto", paidBase: t.payoutBase, txHash: settled?.txHash ?? null };
}

export const getVaultBets = (owner: Address) => withReading(`vaultBets:${owner.toLowerCase()}`, () => listVaultBets(owner));
