// Ported in role from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/price-relay/{relay-pass,tracker}.ts
/**
 * One price-relay pass: the Windows that still owe prints (per Series `[lowIndex, nextIndex)`, 8 back at most), their
 * empty slots on the chain clock, then per slot: copy the open from the previous close when the engine allows it (E-48),
 * else build the source's proof and `recordPrint`. Check slots first (their window closes at T + checkAdmission).
 * A slot past its deadline is reported missed once; the settler voids the Window.
 */
import { copyOpenFromPrevCall, fetchMarkets, fetchSeries, listSeries, marketIdOf, OpsSendError, recordPrintCall, sendOps, type MarketView, type OpsClient, type SeriesView, type Venue } from "@cwf/markets/ops";
import type { PassResult } from "../../runtime/actor";
import { errorText } from "../../runtime/env";
import { proofFor, type ProofContext } from "./proofs";
import { copyableOpen, emptySlots, relayFinished, WHICH, type PrintSlot } from "./slots";

const LOOK_BACK = 8n;
const SERIES_LIST_MS = 5 * 60_000;
const CONCURRENCY = 6;
const MAX_FAILED_ATTEMPTS = 5;

export interface RelayState {
  client: OpsClient;
  venue: Venue;
  proofs: ProofContext;
  dryRun: boolean;
  series: SeriesView[];
  listedMs: number;
  low: Map<string, bigint>;
  failures: Map<string, { attempts: number; reason: string }>;
  missed: Set<string>;
  counters: { recorded: number; copied: number; already: number; failed: number; missed: number };
  recent: Array<{ key: string; slot: string; tx: string }>;
  log: (why: string) => void;
}

const slotKey = (s: PrintSlot) => `${s.market.marketId}:${s.slot}`;
const label = (s: PrintSlot) => `${s.series.symbol ?? s.series.ticker}/${s.series.lane}/${s.series.cadenceSec / 60}m#${s.market.index} ${s.slot}`;

async function refresh(st: RelayState): Promise<void> {
  if (Date.now() - st.listedMs > SERIES_LIST_MS || st.series.length === 0) {
    st.series = (await listSeries(st.client, st.venue)).filter((s) => s.symbol !== null);
    st.listedMs = Date.now();
  } else st.series = await fetchSeries(st.client, st.venue, st.series.map((s) => s.seriesId));
}

async function tracked(st: RelayState, nowSec: number): Promise<Array<{ series: SeriesView; market: MarketView; prev: MarketView | null }>> {
  const wanted: Array<{ series: SeriesView; index: bigint }> = [];
  for (const s of st.series) {
    const floor = s.nextIndex > LOOK_BACK ? s.nextIndex - LOOK_BACK : 0n;
    const low = st.low.get(s.seriesId) ?? floor;
    const from = low > floor ? low : floor;
    for (let i = from > 0n ? from - 1n : 0n; i < s.nextIndex; i++) wanted.push({ series: s, index: i });
  }
  const views = await fetchMarkets(st.client, st.venue, wanted.map((w) => marketIdOf(w.series.seriesId, w.index)));
  const byKey = new Map(wanted.map((w, i) => [`${w.series.seriesId}:${w.index}`, views[i] ?? null]));
  const out: Array<{ series: SeriesView; market: MarketView; prev: MarketView | null }> = [];
  for (const s of st.series) {
    let advancing = true;
    const floor = s.nextIndex > LOOK_BACK ? s.nextIndex - LOOK_BACK : 0n;
    const low = st.low.get(s.seriesId) ?? floor;
    for (let i = low > floor ? low : floor; i < s.nextIndex; i++) {
      const m = byKey.get(`${s.seriesId}:${i}`) ?? null;
      const done = !m || relayFinished(s, m, nowSec);
      if (advancing && done) st.low.set(s.seriesId, i + 1n);
      else advancing = false;
      if (m && !done) out.push({ series: s, market: m, prev: i > 0n ? (byKey.get(`${s.seriesId}:${i - 1n}`) ?? null) : null });
      else if (m && m.state === 0) for (const slot of emptySlots(s, m)) reportMissed(st, slot);
    }
  }
  return out;
}

function reportMissed(st: RelayState, slot: PrintSlot) {
  const key = slotKey(slot);
  if (st.missed.has(key)) return;
  st.missed.add(key);
  st.counters.missed++;
  st.log(`missed ${label(slot)} (T ${slot.boundarySec}, deadline ${slot.deadlineSec}): ${st.failures.get(key)?.reason ?? "no admissible print before the deadline"}`);
}

type Job = { slot: PrintSlot; prev: MarketView | null; copy: boolean };

async function run(st: RelayState, job: Job, nowSec: number): Promise<string> {
  const { slot } = job;
  const key = slotKey(slot);
  let call;
  let note: string;
  if (job.copy) {
    call = copyOpenFromPrevCall(st.venue.engine, slot.market.marketId, job.prev!.marketId);
    note = "copy from prev close";
  } else {
    const r = await proofFor(st.proofs, slot, nowSec);
    if ("wait" in r) return `${label(slot)} waiting: ${r.wait}`;
    if ("unavailable" in r) {
      st.failures.set(key, { attempts: (st.failures.get(key)?.attempts ?? 0) + 1, reason: r.unavailable });
      return `${label(slot)} unavailable: ${r.unavailable}`;
    }
    call = recordPrintCall(st.venue.engine, slot.market.marketId, WHICH[slot.slot], r.proof);
    note = r.note;
  }
  if (st.dryRun) return `DRY ${label(slot)} ${note}`;
  try {
    const sent = await sendOps(st.client, [call]);
    st.failures.delete(key);
    if (job.copy) st.counters.copied++;
    else st.counters.recorded++;
    st.recent = [{ key: label(slot), slot: slot.slot, tx: sent.hash }, ...st.recent].slice(0, 20);
    return `${label(slot)} ✓ ${note} ${sent.hash.slice(0, 10)}`;
  } catch (error) {
    const name = error instanceof OpsSendError ? error.errorName : null;
    if (name === "PrintAlreadyRecorded" || name === "MarketAlreadyTerminal") {
      st.counters.already++;
      return `${label(slot)} already`;
    }
    if (name === "PrintTooEarly") return `${label(slot)} too early (chain clock)`;
    const prev = st.failures.get(key)?.attempts ?? 0;
    st.failures.set(key, { attempts: prev + 1, reason: errorText(error).slice(0, 300) });
    st.counters.failed++;
    return `${label(slot)} failed (${name ?? "no engine error"}): ${errorText(error).slice(0, 160)}`;
  }
}

export async function relayPass(st: RelayState, nowSec: number): Promise<PassResult> {
  await refresh(st);
  const live = await tracked(st, nowSec);
  const jobs: Job[] = [];
  let pending = 0;
  let nextSec = nowSec + 15;
  for (const { series, market, prev } of live) {
    for (const slot of emptySlots(series, market)) {
      const failure = st.failures.get(slotKey(slot));
      if (nowSec > slot.deadlineSec) reportMissed(st, slot);
      else if (failure && failure.attempts >= MAX_FAILED_ATTEMPTS) reportMissed(st, slot);
      else if (slot.slot === "open" && copyableOpen(market, prev, nowSec)) jobs.push({ slot, prev, copy: true });
      else if (nowSec < Math.max(slot.earliestSec, slot.boundarySec)) {
        pending++;
        nextSec = Math.min(nextSec, slot.boundarySec);
      } else jobs.push({ slot, prev, copy: false });
    }
  }
  // Check slots first (their admission closes at T + checkAdmissionSec), then closes, then opens: an open whose
  // predecessor's close lands in this pass is copied from it (E-48) instead of proven again.
  const phase1 = jobs.filter((j) => j.slot.slot !== "open").sort((a, b) => Number(b.slot.slot.startsWith("check")) - Number(a.slot.slot.startsWith("check")) || a.slot.deadlineSec - b.slot.deadlineSec);
  const lines: string[] = [];
  const runAll = async (list: Job[]) => {
    for (let i = 0; i < list.length; i += CONCURRENCY) lines.push(...(await Promise.all(list.slice(i, i + CONCURRENCY).map((j) => run(st, j, nowSec)))));
  };
  await runAll(phase1);
  const closedNow = new Set(phase1.filter((j) => j.slot.slot === "close" && lines.some((l) => l.startsWith(`${label(j.slot)} ✓`) || l.startsWith(`${label(j.slot)} already`))).map((j) => j.slot.market.marketId));
  await runAll(jobs.filter((j) => j.slot.slot === "open").map((j) => {
    const prev = j.prev;
    const copy = j.copy || (!!prev && closedNow.has(prev.marketId) && prev.expirySec === j.slot.market.tradingStartSec && prev.policyVersion === j.slot.market.policyVersion);
    return { ...j, copy };
  }));
  st.proofs.cache.prune(nowSec);
  const waiting = lines.some((l) => l.includes("waiting"));
  const sent = lines.filter((l) => l.includes("✓")).length;
  return {
    why: `${live.length} live Windows · due ${jobs.length} · pending ${pending}${lines.length ? ` | ${lines.join(" | ")}` : ""}${st.dryRun ? " · DRY RUN" : ""}`,
    detail: { ...st.counters, liveWindows: live.length, due: jobs.length, pending, recent: st.recent },
    nextDelayMs: sent > 0 ? 500 : waiting ? 3_000 : Math.max(1_000, Math.min(15_000, (nextSec + 10 - nowSec) * 1000)),
  };
}
