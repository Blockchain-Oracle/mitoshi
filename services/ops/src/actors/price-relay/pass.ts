// Ported in role from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/price-relay/{relay-pass,tracker}.ts
/**
 * One price-relay pass: the Windows that still owe prints (per Series `[lowIndex, nextIndex)`, 8 back at most), their
 * empty slots on the chain clock, then per slot: copy the open from the previous close when the engine allows it (E-48),
 * else build the source's proof and `recordPrint`. A close and the next Window's copied open travel together, and the
 * pass's prints pack into a few transactions, check slots and short cadences first (`pack.ts`, D-230).
 * A slot past its deadline, or refused by the engine `MAX_FAILED_ATTEMPTS` times, is reported missed once; the settler
 * voids the Window. Transport failures never count toward giving up (D-131).
 * A due print stuck past `STALL_AFTER_SEC` is a stall, said in `/health` and `/session.prints` with its kind: `source`
 * (RedStone has no packages for T yet: refusing, unsigned, unreachable) or `sending` (the print is in hand and Tempo's
 * RPC keeps refusing the sends — Mitoshi's own backlog, never blamed on RedStone). While stalled the relay paces itself
 * (`relayDelayMs`): it sleeps to the end of the gateways' rest, or 5 s, instead of re-reading every Window every 1.5 s
 * on the shared RPC budget while nothing can land.
 */
import type { Address } from "viem";
import { copyOpenFromPrevCall, fetchMarkets, fetchSeries, listSeries, marketIdOf, OpsSendError, recordPrintCall, redstoneCoolingUntilMs, sendOps, simulateOps, type MarketView, type OpsClient, type SeriesView, type Venue } from "@cwf/markets/ops";
import type { PassResult } from "../../runtime/actor";
import { errorText } from "../../runtime/env";
import { chainRefused, sendPacked, type PackSender } from "../../runtime/pack";
import { packPrints, type PrintCall, type PrintUnit } from "./pack";
import { proofFor, REDSTONE_FETCH_AFTER_SEC, type ProofContext } from "./proofs";
import { copyableOpen, emptySlots, relayFinished, WHICH, type PrintSlot } from "./slots";

const LOOK_BACK = 8n;
const SERIES_LIST_MS = 5 * 60_000;
const MAX_FAILED_ATTEMPTS = 5;
/** A due print still without its source's data (or still unsent) this long after T is a stall: `/health` and `/session` say so. */
export const STALL_AFTER_SEC = 20;
/** While stalled, a pass at most this often (unless a print lands, or a boundary comes due sooner). */
export const STALLED_PASS_MS = 5_000;
/** Opens landed lately, seconds after their Window's start (`/session` tells the app how long a Window usually prices). */
const OPEN_LAG_KEEP = 30;

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
  /** Seconds from a Window's start to its opening print, newest first (`OPEN_LAG_KEEP`). */
  openLags: number[];
  /** Due prints stuck past `STALL_AFTER_SEC` (on their source, or on sends the RPC refuses): since when, what kind, why. */
  stall: RelayStall | null;
  /** A dry run fills each pack as this address (the role's), never signing or sending (`simulateOps`). */
  simulateFrom?: Address | null;
  log: (why: string) => void;
}

export interface RelayStall {
  sinceSec: number;
  /** `source`: RedStone has nothing for T yet; `sending`: the print is in hand, the RPC keeps refusing its sends. */
  kind: "source" | "sending";
  reason: string;
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

/** Only the chain's answer counts toward giving a slot up; a transport failure retries to the deadline (D-131). */
export { chainRefused };

/** The proven print for a slot (its call), or why not yet (`wait`: the source has nothing yet; `line`: reported). */
async function prepare(st: RelayState, job: Job, nowSec: number): Promise<{ print: PrintCall<Job> } | { line: string; wait: boolean }> {
  const { slot } = job;
  const r = await proofFor(st.proofs, slot, nowSec);
  if ("wait" in r) return { line: `${label(slot)} waiting: ${r.wait}`, wait: true };
  if ("unavailable" in r) {
    const key = slotKey(slot);
    st.failures.set(key, { attempts: (st.failures.get(key)?.attempts ?? 0) + 1, reason: r.unavailable });
    return { line: `${label(slot)} unavailable: ${r.unavailable}`, wait: false };
  }
  return { print: { job, call: recordPrintCall(st.venue.engine, slot.market.marketId, WHICH[slot.slot], r.proof), note: r.note, copy: false } };
}

const copyOf = (st: RelayState, job: Job): PrintCall<Job> => ({ job, call: copyOpenFromPrevCall(st.venue.engine, job.slot.market.marketId, job.prev!.marketId), note: "copy from prev close", copy: true });
const unitOf = (items: PrintCall<Job>[]): PrintUnit<Job> => {
  const s = items[0]!.job.slot;
  return { items, cadenceSec: s.series.cadenceSec, deadlineSec: s.deadlineSec, check: s.slot.startsWith("check") };
};

/** `m` opens where `prev` closes, on the same policy version, still inside its open admission: E-48's copy holds. */
export const adjacent = (prev: MarketView, m: MarketView, nowSec: number) => prev.seriesIdx === m.seriesIdx && prev.expirySec === m.tradingStartSec && prev.policyVersion === m.policyVersion && nowSec <= m.openDeadlineSec;

function landed(st: RelayState, c: PrintCall<Job>, hash: string, inTx: number): string {
  const { slot } = c.job;
  st.failures.delete(slotKey(slot));
  if (c.copy) st.counters.copied++;
  else st.counters.recorded++;
  st.recent = [{ key: label(slot), slot: slot.slot, tx: hash }, ...st.recent].slice(0, 20);
  if (slot.slot === "open") st.openLags = [Math.max(0, Math.floor(Date.now() / 1000) - slot.boundarySec), ...st.openLags].slice(0, OPEN_LAG_KEEP);
  return `${label(slot)} ✓ ${c.note} ${hash.slice(0, 10)}${inTx > 1 ? ` (${inTx} in tx)` : ""}`;
}

function failed(st: RelayState, c: PrintCall<Job>, error: unknown): string {
  const { slot } = c.job;
  const name = error instanceof OpsSendError ? error.errorName : null;
  if (name === "PrintAlreadyRecorded" || name === "MarketAlreadyTerminal") {
    st.counters.already++;
    return `${label(slot)} already`;
  }
  if (name === "PrintTooEarly") return `${label(slot)} too early (chain clock)`;
  const key = slotKey(slot);
  const prev = st.failures.get(key)?.attempts ?? 0;
  st.failures.set(key, { attempts: prev + (chainRefused(error) ? 1 : 0), reason: errorText(error).slice(0, 300) });
  st.counters.failed++;
  return `${label(slot)} failed (${name ?? "no engine error"}): ${errorText(error).slice(0, 160)}`;
}

/**
 * How the pass's packs go out: from the role key, stamped with the chain clock; in a dry run with `simulateFrom`, each
 * pack filled as that address instead (every call executed, nothing signed or sent) and reported, touching no counter.
 */
function sender(st: RelayState, clockSec: () => number, sendFails: PrintSlot[]): PackSender<PrintCall<Job>> {
  const simulate = st.dryRun ? (st.simulateFrom ?? null) : null;
  return {
    send: async (items) => {
      const calls = items.map((c) => c.call);
      if (!st.dryRun) return (await sendOps(st.client, calls, { nowSec: clockSec() })).hash;
      if (!simulate) return "unsent";
      return `gas ${(await simulateOps(st.client, calls, simulate, clockSec())).gas}`;
    },
    refused: chainRefused,
    landed: (c, hash, inTx) => (st.dryRun ? `DRY ${label(c.job.slot)} ${c.note}${simulate ? ` · fills (${hash}, ${inTx} in tx)` : ""}` : landed(st, c, hash, inTx)),
    failed: (c, error) => {
      // The transport's answer (429, -32005, a timeout): the print is ready and the send never reached the engine.
      if (!chainRefused(error)) sendFails.push(c.job.slot);
      return st.dryRun ? `DRY ${label(c.job.slot)} refused: ${error instanceof OpsSendError ? (error.errorName ?? errorText(error).slice(0, 120)) : errorText(error).slice(0, 120)}` : failed(st, c, error);
    },
    skipped: (c, after) => `${label(c.job.slot)} waits for ${label(after.job.slot)}`,
  };
}

/** The pass's due slots → units: proven prints (checks, closes) with the next Window's open copied behind its close. */
async function unitsOf(st: RelayState, jobs: Job[], nowSec: number): Promise<{ units: PrintUnit<Job>[]; lines: string[]; waits: PrintSlot[] }> {
  const lines: string[] = [];
  const waits: PrintSlot[] = [];
  const units: PrintUnit<Job>[] = [];
  const closes = new Map<string, PrintUnit<Job>>();
  const take = (job: Job, r: Awaited<ReturnType<typeof prepare>>) => {
    if ("print" in r) return unitOf([r.print]);
    lines.push(r.line);
    if (r.wait) waits.push(job.slot);
    return null;
  };
  const proven = jobs.filter((j) => j.slot.slot !== "open");
  for (const [i, r] of (await Promise.all(proven.map((j) => prepare(st, j, nowSec)))).entries()) {
    const unit = take(proven[i]!, r);
    if (!unit) continue;
    units.push(unit);
    if (proven[i]!.slot.slot === "close") closes.set(proven[i]!.slot.market.marketId, unit);
  }
  const opens: Job[] = [];
  for (const j of jobs.filter((x) => x.slot.slot === "open")) {
    const withClose = j.prev ? closes.get(j.prev.marketId) : undefined;
    if (withClose && adjacent(j.prev!, j.slot.market, nowSec)) withClose.items.push(copyOf(st, j));
    else if (j.copy) units.push(unitOf([copyOf(st, j)]));
    else opens.push(j);
  }
  for (const [i, r] of (await Promise.all(opens.map((j) => prepare(st, j, nowSec)))).entries()) {
    const unit = take(opens[i]!, r);
    if (unit) units.push(unit);
  }
  return { units, lines, waits };
}

/**
 * The oldest due print stuck past `STALL_AFTER_SEC`, with why; else null. A print with no source data is the price
 * network's stall (its last word); a print in hand whose sends the RPC refuses is a `sending` stall. Source first: with
 * both, the network is what holds the Windows.
 */
export function stallOf(st: Pick<RelayState, "stall" | "proofs" | "failures">, waits: readonly PrintSlot[], sendFails: readonly PrintSlot[], nowSec: number): RelayStall | null {
  const lateOf = (xs: readonly PrintSlot[]) => xs.filter((s) => nowSec - s.boundarySec >= STALL_AFTER_SEC);
  const source = lateOf(waits);
  const sending = lateOf(sendFails);
  const kind = source.length ? "source" : sending.length ? "sending" : null;
  if (!kind) return null;
  const oldest = (kind === "source" ? source : sending).reduce((a, b) => (b.boundarySec < a.boundarySec ? b : a));
  const reason = kind === "source" ? (st.proofs.cache.error(oldest.boundarySec) ?? "the price network has not signed it yet") : `Tempo's RPC refuses the sends: ${st.failures.get(slotKey(oldest))?.reason ?? "transport failure"}`;
  const sinceSec = st.stall && st.stall.kind === kind && st.stall.sinceSec <= oldest.boundarySec ? st.stall.sinceSec : oldest.boundarySec;
  return { sinceSec, kind, reason: reason.slice(0, 200) };
}

/**
 * When the next pass comes. A print landed: at once (more may be ready). Waiting on RedStone inside its usual few
 * seconds: 1.5 s. Stalled: 5 s — or, when every gateway is resting, the end of that rest — so a stall that lasts a
 * RedStone refusal window doesn't spend the shared RPC budget the settler and the house need; but never past the next
 * boundary's first ask (at most 15 s). Otherwise: that first ask, within 1–15 s.
 */
export function relayDelayMs(i: { sent: number; waiting: number; stall: RelayStall | null; nowSec: number; nextSec: number; coolUntilMs: number | null; nowMs?: number }): number {
  const boundaryMs = Math.max(1_000, Math.min(15_000, (i.nextSec + REDSTONE_FETCH_AFTER_SEC - i.nowSec) * 1000));
  if (i.sent > 0) return 500;
  if (i.stall) {
    const rest = i.stall.kind === "source" && i.coolUntilMs !== null ? i.coolUntilMs - (i.nowMs ?? Date.now()) : 0;
    return Math.min(Math.max(STALLED_PASS_MS, rest), boundaryMs);
  }
  if (i.waiting) return 1_500;
  return boundaryMs;
}

export async function relayPass(st: RelayState, nowSec: number): Promise<PassResult> {
  const startedMs = Date.now();
  const clockSec = () => nowSec + Math.floor((Date.now() - startedMs) / 1000);
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
  const { units, lines, waits } = await unitsOf(st, jobs, nowSec);
  const packs = packPrints(units);
  const sendFails: PrintSlot[] = [];
  lines.push(...(await sendPacked(packs, sender(st, clockSec, sendFails))));
  st.proofs.cache.prune(nowSec);
  const stall = stallOf(st, waits, sendFails, nowSec);
  if (stall && (!st.stall || st.stall.kind !== stall.kind)) st.log(`stalled (${stall.kind}): prints due since ${stall.sinceSec} ${stall.kind === "source" ? "have no source data" : "can't be sent"} (${stall.reason})`);
  if (!stall && st.stall) st.log(`stall over: prints land again (since ${st.stall.sinceSec})`);
  st.stall = stall;
  const sent = lines.filter((l) => l.includes("✓")).length;
  const lags = [...st.openLags].sort((a, b) => a - b);
  return {
    why: `${live.length} live Windows · due ${jobs.length} · pending ${pending}${packs.length ? ` · ${packs.length} tx` : ""}${stall ? ` · STALLED (${stall.kind}) since ${stall.sinceSec}` : ""}${lines.length ? ` | ${lines.join(" | ")}` : ""}${st.dryRun ? " · DRY RUN" : ""}`,
    detail: { ...st.counters, liveWindows: live.length, due: jobs.length, pending, txs: packs.length, stall, openLagSec: lags.length ? { p50: lags[Math.floor(lags.length / 2)]!, max: lags.at(-1)!, n: lags.length } : null, recent: st.recent },
    nextDelayMs: relayDelayMs({ sent, waiting: waits.length + sendFails.length, stall, nowSec, nextSec, coolUntilMs: redstoneCoolingUntilMs(st.proofs.sources.gateways) }),
  };
}
