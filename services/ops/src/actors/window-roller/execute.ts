// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/window-roller/execute.ts (Book
// recycling and Ledger growth removed: one engine with a shared node pool, A.1.3; `sweepExpired` is the settler's).
/**
 * One roller pass: re-read every registry Series on the chain clock, plan each by lane, and open what is due. Every
 * send is preceded by a fresh Series read and a simulation; "already opened" engine errors count as done.
 */
import { laneKey, laneListable } from "@cwf/core";
import { fetchSeries, listSeries, openWindowCall, OpsSendError, sendOps, type OpsClient, type SeriesView, type Venue } from "@cwf/markets/ops";
import type { PassResult } from "../../runtime/actor";
import { errorText } from "../../runtime/env";
import { spanOf, type PlanClock, type SeriesPlan } from "./plan";
import { gapSpanOf, planByLane } from "./plan-lanes";
import { versionWindow } from "./versions";

export interface RollerSettings {
  leadSec: number;
  gapLeadSec: number;
  minTradableSec: number;
  prelist: boolean;
  prelistCadencesSec: readonly number[];
  /** Optional `TSLA-5m,TSLA-gap,BTC-5m` filter; empty = every Series of a registry ticker. */
  only: readonly string[];
  /** Opens sent at once (expiring nonces make them independent). */
  concurrency: number;
}

export interface RollerState {
  client: OpsClient;
  venue: Venue;
  settings: RollerSettings;
  dryRun: boolean;
  series: SeriesView[];
  seriesListedMs: number;
  lanes: Record<string, string>;
  counters: { opened: number; failed: number };
  /** Recent open receipts for the heartbeat (the acceptance samples). */
  recent: Array<{ key: string; index: string; tx: string }>;
}

const SERIES_LIST_MS = 5 * 60_000;
export const seriesKey = (s: SeriesView) => (s.symbol && s.lane ? laneKey(s.symbol, s.lane, s.cadenceSec) : `#${s.ticker}-${s.basis}-${s.cadenceSec}`);
const spanFor = (s: SeriesView, w: { tradingStartSec: number; expirySec: number }) => (s.lane === "gap" ? gapSpanOf(w) : spanOf(w));
const ALREADY = new Set(["BadWindowIndex", "WindowOverlap"]);

async function refreshSeries(state: RollerState): Promise<void> {
  const listed =
    Date.now() - state.seriesListedMs >= SERIES_LIST_MS
      ? await listSeries(state.client, state.venue)
      : await fetchSeries(state.client, state.venue, state.series.map((s) => s.seriesId));
  if (Date.now() - state.seriesListedMs >= SERIES_LIST_MS) state.seriesListedMs = Date.now();
  const known = listed.filter((s) => s.symbol !== null && s.lane !== null && laneListable(s.symbol, s.lane));
  state.series = state.settings.only.length ? known.filter((s) => state.settings.only.includes(seriesKey(s))) : known;
}

export function planFor(s: SeriesView, clock: PlanClock): SeriesPlan {
  return planByLane(
    { key: seriesKey(s), symbol: s.symbol!, lane: s.lane!, cadenceSec: s.cadenceSec, maxLeadSec: s.maxLeadSec, nextIndex: s.nextIndex, lastExpirySec: s.lastExpirySec, versions: s.versions.map(versionWindow) },
    clock,
  );
}

async function open(state: RollerState, s: SeriesView, plan: Extract<SeriesPlan, { kind: "open" }>, notes: string[]): Promise<string> {
  const key = seriesKey(s);
  const w = plan.window;
  if (state.dryRun) {
    notes.push(`DRY openWindow ${key} ${plan.state}`);
    return `DRY ${plan.state}`;
  }
  try {
    const sent = await sendOps(state.client, [openWindowCall(state.venue.engine, { seriesId: s.seriesId, index: plan.index, tradingStartSec: w.tradingStartSec, lockAtSec: w.lockAtSec, expirySec: w.expirySec, openKind: plan.openKind, closeKind: plan.closeKind })]);
    state.counters.opened++;
    state.recent = [{ key, index: plan.index.toString(), tx: sent.hash }, ...state.recent].slice(0, 20);
    const verb = plan.state.startsWith("prelisting") ? "prelisted" : "opened";
    notes.push(`${verb} ${key} #${plan.index} ${spanFor(s, w)} ${sent.hash}`);
    return `${verb === "prelisted" ? "prelisted" : "open"} #${plan.index} ${spanFor(s, w)}`;
  } catch (error) {
    if (error instanceof OpsSendError && error.errorName && ALREADY.has(error.errorName)) return "already opened: re-reading";
    state.counters.failed++;
    notes.push(`open ${key} #${plan.index} failed: ${errorText(error)}`);
    return `open failed: ${errorText(error).split("\n")[0]}`;
  }
}

async function inBatches<T>(items: readonly T[], size: number, fn: (t: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export async function rollerPass(state: RollerState, clockOf: () => Promise<PlanClock>): Promise<PassResult> {
  await refreshSeries(state);
  const clock = await clockOf();
  const notes: string[] = [];
  const due: Array<{ s: SeriesView; plan: Extract<SeriesPlan, { kind: "open" }> }> = [];
  let wake = Number.MAX_SAFE_INTEGER;
  for (const s of state.series) {
    const plan = planFor(s, clock);
    if (plan.kind === "open") due.push({ s, plan });
    else {
      state.lanes[seriesKey(s)] = plan.state;
      if (plan.wakeSec !== null) wake = Math.min(wake, plan.wakeSec);
    }
  }
  await inBatches(due, state.settings.concurrency, async ({ s, plan }) => void (state.lanes[seriesKey(s)] = await open(state, s, plan, notes)));
  const opened = due.length;
  const nextMs = opened > 0 ? 1_000 : Math.max(1_000, Math.min(15_000, (wake - clock.nowSec) * 1000));
  const counts = Object.values(state.lanes).reduce<Record<string, number>>((acc, v) => ((acc[v.split(/[:# ]/)[0]!] = (acc[v.split(/[:# ]/)[0]!] ?? 0) + 1), acc), {});
  return {
    why: `${state.series.length} lanes · ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}${notes.length ? ` | ${notes.join(" | ")}` : ""}${state.dryRun ? " · DRY RUN" : ""}`,
    detail: { lanes: { ...state.lanes }, counters: { ...state.counters }, recent: state.recent, calendar: clock.calendar ? "agreed" : "none" },
    nextDelayMs: nextMs,
  };
}
