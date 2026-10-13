import "server-only";
// Ported from Owarine 90a91d71:web/src/features/strategies/preview.server.ts (R4-6, D-227) — the studio's test read: the
// same `decideAgentWindow` the runner calls, on a live Window of the draft's cadences, over the same context
// (`agentContextOf`: the opening print, the stored RedStone ticks the ops spot feed writes, both books at the stake), with
// an empty record — one real model call, nothing sent, nothing stored. With no model key it says which variable is
// missing, as the runner's heartbeat would. Rate-limited: one per 10 s per address, 60 an hour in all.
import { decideAgentWindow, missingCredentialHint, resolveModel } from "@cwf/brain";
import { AGENT_CADENCES_SEC, AGENT_PERSONA_MAX_CHARS, AGENT_POSTURES, decisionSlot, EMPTY_AGENT_RECORD, formatBaseUnits, formatCadence, isSpec, moveBps, type AgentPosture, type AgentSpec } from "@cwf/core";
import { readSpotTicks } from "@cwf/db/idx";
import { createOpsClient, listSeries, readBooks, runnerVenueOf, tradingWindowsOf, type RunnerWindow } from "@cwf/markets/ops";
import { agentContextOf, AGENT_FEED_DECIMALS } from "@cwf/markets/strategies";
import { CHAIN } from "@cwf/clients";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import type { AgentPreviewRequest, AgentPreviewResponse } from "./protocol";

const MIN_GAP_MS = 10_000;
const PER_HOUR = 60;
const HOUR_MS = 3_600_000;
const SPOT_MAX_AGE_SEC = 60;
const MAX_STAKE_BASE = 1_000_000_000n;
const DAILY_MULTIPLE = 10n;

export const PREVIEW = {
  badRequest: "That draft can't be read: check its brief and Windows.",
  tooFast: "One test read every 10 seconds.",
  busy: "Test reads are busy this hour. Try again later.",
  notConfigured: (hint: string) => `No model key on this deployment (${hint}).`,
  noVenue: "The strategy registry isn't on this network yet.",
  noWindow: "No Window of these lengths is trading now.",
  noSpot: "No fresh RedStone price for that Window yet.",
  unreadable: "The test read couldn't be completed. Try again.",
};

const lastByIp = new Map<string, number>();
let hourHits: number[] = [];

export function previewGate(ip: string, nowMs: number): { ok: true } | { ok: false; error: string } {
  if (nowMs - (lastByIp.get(ip) ?? 0) < MIN_GAP_MS) return { ok: false, error: PREVIEW.tooFast };
  hourHits = hourHits.filter((at) => nowMs - at < HOUR_MS);
  if (hourHits.length >= PER_HOUR) return { ok: false, error: PREVIEW.busy };
  if (lastByIp.size > 5_000) lastByIp.clear();
  lastByIp.set(ip, nowMs);
  hourHits.push(nowMs);
  return { ok: true };
}

/** The request, checked: a real agent spec and a positive stake under $1,000. */
export function parsePreview(body: unknown): AgentPreviewRequest | null {
  const b = body as Partial<AgentPreviewRequest> | null;
  if (!b || typeof b.persona !== "string" || b.persona.length > AGENT_PERSONA_MAX_CHARS || !AGENT_POSTURES.includes(b.posture as AgentPosture)) return null;
  if (!Array.isArray(b.cadences) || b.cadences.length === 0 || !b.cadences.every((c) => AGENT_CADENCES_SEC.includes(c))) return null;
  if (typeof b.stakeBase !== "string" || !/^\d{1,12}$/.test(b.stakeBase) || BigInt(b.stakeBase) <= 0n || BigInt(b.stakeBase) > MAX_STAKE_BASE) return null;
  return { persona: b.persona, posture: b.posture as AgentPosture, cadences: [...new Set(b.cadences)].sort((x, y) => x - y), stakeBase: b.stakeBase };
}

export type PreviewOutcome = { ok: true; body: AgentPreviewResponse } | { ok: false; status: 400 | 502 | 503; error: string };

/** The Window a read would take now: one inside its decision slot (shortest first), else the soonest to close. */
function pickWindow(windows: readonly RunnerWindow[], nowMs: number): { w: RunnerWindow; inSlot: boolean } | null {
  const slot = (w: RunnerWindow) => decisionSlot({ tradingStartSec: w.tradingStartSec, expirySec: w.expirySec, intervalSec: w.cadenceSec }, nowMs);
  const inSlot = windows.filter((w) => slot(w).open).sort((a, b) => a.cadenceSec - b.cadenceSec)[0];
  if (inSlot) return { w: inSlot, inSlot: true };
  const soonest = [...windows].sort((a, b) => a.expirySec - b.expirySec)[0];
  return soonest ? { w: soonest, inSlot: false } : null;
}

export async function dryReadAgent(request: AgentPreviewRequest, nowMs: number): Promise<PreviewOutcome> {
  const brain = resolveModel();
  if (!brain) return { ok: false, status: 503, error: PREVIEW.notConfigured(missingCredentialHint()) };
  const spec: AgentSpec = { preset: "agent", persona: request.persona.trim(), posture: request.posture, cadences: request.cadences };
  if (!isSpec(spec)) return { ok: false, status: 400, error: PREVIEW.badRequest };
  const env = serverEnv();
  const venue = runnerVenueOf(env.network === "mainnet" ? CHAIN.tempo : CHAIN.moderato);
  if (!venue) return { ok: false, status: 503, error: PREVIEW.noVenue };
  const client = createOpsClient({ network: env.network, rpcUrl: env.rpcHttpUrl, tier: 2 });
  const nowSec = Math.floor(nowMs / 1000);
  // Any-Window agents read the 24/7 crypto lanes, as the runner does for a strategy with no series.
  const series = (await listSeries(client, venue)).filter((s) => s.lane === "crypto24" && spec.cadences.includes(s.cadenceSec));
  const picked = pickWindow(await tradingWindowsOf(client, venue, series.map((s) => s.seriesId), nowSec), nowMs);
  if (!picked) return { ok: false, status: 503, error: PREVIEW.noWindow };
  const { w } = picked;
  const stakeBase = BigInt(request.stakeBase);
  const [books, ticks] = await Promise.all([readBooks(client, venue, [w.marketId]), w.spotSymbol ? readSpotTicks(db(), w.spotSymbol, w.tradingStartSec - 600, nowSec) : Promise.resolve([])]);
  const newestAt = (sec: number, windowSec: number) => {
    for (let i = ticks.length - 1; i >= 0; i -= 1) {
      const t = ticks[i]!;
      if (t.publishSec <= sec) return t.publishSec >= sec - windowSec ? { priceE8: t.priceE8 } : null;
    }
    return null;
  };
  const spot = { latest: () => newestAt(nowSec, SPOT_MAX_AGE_SEC), at: newestAt };
  const context = agentContextOf({ window: w, spot, book: books.get(w.marketId.toLowerCase()) ?? null, stakeBase, nowMs });
  if (!context) return { ok: false, status: 503, error: PREVIEW.noSpot };
  const envelope = { maxStakePerTradeBase: stakeBase, maxDailySpendBase: stakeBase * DAILY_MULTIPLE, maxOpenPositions: 2, maxPriceRaw: 0n, market: null };
  const { read, decision } = await decideAgentWindow({ spec, context, record: EMPTY_AGENT_RECORD, envelope, nowSec, model: brain.model, timeoutMs: 20_000 });
  return {
    ok: true,
    body: {
      market: { marketId: w.marketId, label: `${context.asset} ${formatCadence(w.cadenceSec)}`, elapsedSec: context.elapsedSec, leftSec: context.leftSec, inSlot: picked.inSlot },
      read: { openingText: `$${formatBaseUnits(w.openPriceE8, AGENT_FEED_DECIMALS, { minDp: 2, maxDp: 2 })}`, moveBps: moveBps(w.openPriceE8, context.emaRaw), upCents: context.upCents, downCents: context.downCents },
      verdict: read.ok ? read.verdict : null,
      failure: read.ok ? null : `${read.failure}: ${read.detail}`,
      gate: { side: decision.side, reason: decision.reason },
      model: read.ok ? read.modelId : `${brain.providerName}/${brain.modelId}`,
    },
  };
}
