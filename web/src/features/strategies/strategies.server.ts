import "server-only";
// Ported from Agari 03b30ab:web/src/features/strategies/registry.server.ts — the registry is read from Mitoshi's index
// (S9.4), settlement from the index's Windows (the engine's payout numerators), and the runner's own store answers the
// record, the heartbeats and an agent's decisions; one read per minute shared by every reader ("use cache").
/**
 * The desk's catalogue: every strategy on the registry with its own record (follow fills — a fade is a subscriber's bet
 * against it), its runner's health in its own words, an agent's last Windows, and its ERC-8004 feedback; plus the
 * latest copy fills. A store that cannot be read fails the whole read (503) rather than serving "empty".
 */
import { cacheLife } from "next/cache";
import { getAddress, isAddress } from "viem";
import { CHAIN } from "@cwf/clients";
import { deriveRunnerHealth, describeSpec, formatCadence, laneBasisOf, parseStrategyMetadata, scoreFillByPayout, strategyRecord, type Address, type AgentWindowOutcome, type MarketId, type StrategyFill } from "@cwf/core";
import { createPgStrategyStore } from "@cwf/db";
import { readIndexedStrategies, readSeriesList, readSubscriptionsOf, readWindowFacts, type IndexedStrategy, type WindowFacts } from "@cwf/db/idx";
import { strategyVenueOf } from "@cwf/markets/strategies";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import type { DecisionWire, FillWire, MinePayload, StrategiesPayload, StrategyWire } from "./protocol";

const FILL_LIMIT = 500;
const DECISION_LIMIT = 200;
const DECISIONS_PER_CARD = 8;

/** The house runner (`strategy-runner` role) — public: every house strategy names it on chain. */
const houseRunner = () => {
  const a = process.env.HOUSE_RUNNER_ADDRESS?.trim();
  return a && isAddress(a) ? getAddress(a) : null;
};
/** "BTC 5m", "TSLA 24/7 15m", "AAPL Monday gap" — the lane's own words (`LaneBasis`). */
const seriesLabel = (symbol: string, cadenceSec: number, basis: number) => {
  const lane = laneBasisOf(basis);
  return lane === "gap" ? `${symbol} Monday gap` : `${symbol}${lane === "stock24" ? " 24/7" : ""} ${formatCadence(cadenceSec)}`;
};
const chainId = () => (serverEnv().network === "mainnet" ? CHAIN.tempo : CHAIN.moderato);
const labelOf = (f: WindowFacts | undefined) => (f?.symbol && f.cadenceSec ? `${f.symbol} ${formatCadence(f.cadenceSec)}` : null);

function outcomeOf(side: "up" | "down" | null, f: WindowFacts | undefined): AgentWindowOutcome | null {
  if (!side) return null;
  if (!f?.settled) return "open";
  if (f.voided) return "void";
  return (side === "up" ? f.payoutYes > f.payoutNo : f.payoutNo > f.payoutYes) ? "won" : "lost";
}

const toFill = (r: { txHash: string; strategyId: string; grantId: string; owner: string; marketId: string; side: "up" | "down"; mode: "follow" | "fade"; cashDelta: string; tokenDelta: string; atSec: number; dryRun: boolean }): StrategyFill => ({
  txHash: r.txHash as StrategyFill["txHash"], strategyId: BigInt(r.strategyId), grantId: BigInt(r.grantId), owner: r.owner as Address, marketId: r.marketId as MarketId, side: r.side,
  cashDeltaBase: BigInt(r.cashDelta), tokenDeltaRaw: BigInt(r.tokenDelta), atSec: r.atSec, dryRun: r.dryRun, mode: r.mode,
});

function fillWire(f: StrategyFill, facts: Map<string, WindowFacts>): FillWire {
  const s = scoreFillByPayout(f, facts.get(f.marketId.toLowerCase()) ?? null);
  return {
    txHash: f.txHash, strategyId: f.strategyId.toString(), owner: f.owner, marketId: f.marketId, label: labelOf(facts.get(f.marketId.toLowerCase())), side: f.side, mode: f.mode,
    cashDeltaBase: f.cashDeltaBase.toString(), tokenDeltaRaw: f.tokenDeltaRaw.toString(), atSec: f.atSec, settled: s.settled, pnlBase: s.pnlBase === null ? null : s.pnlBase.toString(),
  };
}

function strategyWire(s: IndexedStrategy, fills: StrategyFill[], facts: Map<string, WindowFacts>, beat: { tickAtMs: number; intervalMs: number; why: string } | undefined, decisions: DecisionWire[], nowMs: number): StrategyWire {
  const meta = s.metadata ? parseStrategyMetadata(s.metadata) : null;
  const own = fills.filter((f) => f.strategyId.toString() === s.strategyId && f.mode === "follow").map((f) => scoreFillByPayout(f, facts.get(f.marketId.toLowerCase()) ?? null));
  const r = strategyRecord(own);
  const seriesLabel = s.seriesSymbol && s.seriesCadenceSec ? `${s.seriesSymbol} ${formatCadence(s.seriesCadenceSec)}` : null;
  return {
    strategyId: s.strategyId, creator: s.creator, runner: s.runner, agentId: s.agentId,
    name: meta?.name ?? `Strategy #${s.strategyId}`, description: meta?.description ?? "", spec: meta?.spec ?? null,
    specText: meta ? describeSpec(meta.spec, s.seriesSymbol ?? "the asset") : null,
    envelope: { maxStakePerTradeBase: s.maxStakePerTradeBase, maxDailySpendBase: s.maxDailySpendBase, maxOpenPositions: s.maxOpenPositions, maxPriceRaw: s.maxPriceRaw, series: s.series, seriesLabel },
    feeBase: s.feeBase, active: s.active, subscribers: s.subscribers, createdAtSec: s.createdAtSec, revision: s.revision,
    record: {
      fills: r.fills, settled: r.settled, wins: r.wins, losses: r.losses, voids: r.voids, netBase: r.netBase.toString(), stakedBase: r.stakedBase.toString(),
      curve: r.curve.map((p) => ({ atSec: p.atSec, cumBase: p.cumBase.toString() })), lastActiveSec: r.lastActiveSec, distinctSubscribers: r.distinctSubscribers, open: r.fills - r.settled,
    },
    health: deriveRunnerHealth({ lastTickMs: beat?.tickAtMs ?? null, intervalMs: beat?.intervalMs ?? null, why: beat?.why ?? null, nowMs, reachable: true }),
    agent: meta?.spec.preset === "agent" ? { model: decisions[0]?.model ?? null, decisions } : null,
    feedback: { count: s.feedbackCount, mean: s.feedbackMean },
  };
}

/** Throws on a failed read, so the cache never keeps one. */
export async function readStrategies(): Promise<StrategiesPayload> {
  "use cache";
  cacheLife("minutes");
  const nowMs = Date.now();
  const venue = strategyVenueOf(chainId());
  if (!venue) return { deployed: false, registry: null, houseRunner: null, series: [], strategies: [], fills: [], computedAtMs: nowMs };
  const sql = db();
  const store = createPgStrategyStore(sql);
  const [rows, fillRows, beats, decisionRows, seriesRows] = await Promise.all([
    readIndexedStrategies(sql, { registry: venue.strategyRegistry }), store.listFills({ strategyId: null, limit: FILL_LIMIT }), store.latestHeartbeats(), store.listDecisions(null, DECISION_LIMIT),
    readSeriesList(sql),
  ]);
  const fills = fillRows.map(toFill);
  const facts = await readWindowFacts(sql, [...new Set([...fills.map((f) => f.marketId), ...decisionRows.map((d) => d.marketId)])]);
  const beatBy = new Map(beats.filter((b) => !b.dryRun).map((b) => [b.strategyId, b]));
  const decisionsBy = new Map<string, DecisionWire[]>();
  for (const d of decisionRows) {
    const list = decisionsBy.get(d.strategyId) ?? [];
    const f = facts.get(d.marketId);
    if (list.length < DECISIONS_PER_CARD) {
      list.push({ marketId: d.marketId, decidedAtMs: d.decidedAtMs, verdictSide: d.verdictSide, confidence: d.confidence, why: d.why, gate: d.gate, gateReason: d.gateReason, side: d.side, filled: d.filled, model: d.model, label: labelOf(f), outcome: outcomeOf(d.side, f) });
    }
    decisionsBy.set(d.strategyId, list);
  }
  return {
    deployed: true,
    registry: getAddress(venue.strategyRegistry),
    houseRunner: houseRunner(),
    series: seriesRows.filter((r) => r.symbol).map((r) => ({ seriesId: r.series, label: seriesLabel(r.symbol!, r.cadenceSec, r.basis), symbol: r.symbol!, cadenceSec: r.cadenceSec })),
    strategies: rows.map((s) => strategyWire(s, fills, facts, beatBy.get(s.strategyId), decisionsBy.get(s.strategyId) ?? [], nowMs)),
    fills: fills.slice(0, 50).map((f) => fillWire(f, facts)),
    computedAtMs: nowMs,
  };
}

/** One wallet's consents and copy fills — never cached (a copy must show at once). */
export async function readMine(wallet: Address): Promise<MinePayload> {
  const nowMs = Date.now();
  const venue = strategyVenueOf(chainId());
  if (!venue) return { subscriptions: [], fills: [], computedAtMs: nowMs };
  const sql = db();
  const [subs, fillRows] = await Promise.all([readSubscriptionsOf(sql, venue.strategyRegistry, wallet), createPgStrategyStore(sql).listFills({ strategyId: null, owner: wallet, limit: FILL_LIMIT })]);
  const fills = fillRows.map(toFill);
  const facts = await readWindowFacts(sql, [...new Set(fills.map((f) => f.marketId))]);
  return {
    subscriptions: subs.map((s) => ({ strategyId: s.strategyId, grantId: s.grantId, mode: s.mode, active: s.active, feesPaidBase: s.feesPaidBase, subscribedAtSec: s.subscribedAtSec })),
    fills: fills.map((f) => fillWire(f, facts)),
    computedAtMs: nowMs,
  };
}

