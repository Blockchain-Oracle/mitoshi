// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/calendar/session-service.ts — the Pyth
// schedule is replaced by RedStone's signed `NY_MARKET_NEXT_CHANGE_TIME` (core `agreeWithRedStone`, plan C.5.2 calendar).
/**
 * The session calendar every venue actor reads: Alpaca ∩ RedStone, date by date. RedStone's observations are the
 * archived boundaries of the last day (`print_archive`, every 5 min) plus the gateway's latest package; each must name
 * the boundary Alpaca implies, else the dates it spans become unknown and nothing lists on them. Refreshed hourly; a
 * failed refresh keeps the last agreed calendar while it still covers today, and lists nothing once it doesn't.
 */
import { addDays, agreeWithRedStone, etDateOf, sessionStatus, type NextChangeDisagreement, type NextChangeObservation, type SessionCalendar, type SessionStatus } from "@cwf/core";
import type { Sql } from "@cwf/db";
import { errorText } from "../runtime/env";
import { fetchRedstoneLatest, type RedstoneSources } from "../prices/redstone-gateway";
import { fetchAlpacaCalendar } from "./alpaca";

export interface SessionService {
  /** The agreed calendar, or null before the first successful refresh (list nothing). */
  calendar(): SessionCalendar | null;
  status(nowSec: number, halted?: boolean): SessionStatus | null;
  disagreements(): readonly NextChangeDisagreement[];
  /** Refreshes when stale (or when `force`); never throws. Returns a log-safe line. */
  refresh(force?: boolean): Promise<string>;
}

const REFRESH_MS = 60 * 60 * 1000;
const DAYS_BACK = 7;
const DAYS_AHEAD = 14;
export const NEXT_CHANGE_FEED = "NY_MARKET_NEXT_CHANGE_TIME";

type Pkg = { timestampMilliseconds: number; signerAddress: string; dataPoints?: { value?: number }[] };

/** One observation per boundary: the value ≥ 3 configured signers agree on (ms → s). */
export function observationOf(packages: readonly Pkg[], signers: ReadonlySet<string>, threshold = 3): NextChangeObservation | null {
  const byValue = new Map<number, Set<string>>();
  let observedMs = 0;
  for (const p of packages) {
    const v = p.dataPoints?.[0]?.value;
    if (typeof v !== "number" || !signers.has(p.signerAddress.toLowerCase())) continue;
    observedMs = Math.max(observedMs, p.timestampMilliseconds);
    byValue.set(v, (byValue.get(v) ?? new Set()).add(p.signerAddress.toLowerCase()));
  }
  const agreed = [...byValue.entries()].find(([, who]) => who.size >= threshold);
  return agreed ? { observedSec: Math.floor(observedMs / 1000), nextChangeSec: Math.floor(agreed[0] / 1000) } : null;
}

async function redstoneObservations(sql: Sql | null, sources: RedstoneSources, sinceSec: number): Promise<NextChangeObservation[]> {
  const out: NextChangeObservation[] = [];
  if (sql) {
    const rows = await sql<{ feeds: Record<string, Pkg[]> }[]>`select jsonb_build_object(${NEXT_CHANGE_FEED}::text, feeds -> ${NEXT_CHANGE_FEED}::text) as feeds from print_archive where source = 'redstone' and t_sec >= ${sinceSec} order by t_sec`;
    for (const r of rows) {
      const o = observationOf(r.feeds[NEXT_CHANGE_FEED] ?? [], sources.signers, sources.threshold);
      if (o) out.push(o);
    }
  }
  const { text } = await fetchRedstoneLatest(sources.gateways);
  const latest = (JSON.parse(text) as Record<string, Pkg[]>)[NEXT_CHANGE_FEED] ?? [];
  const newest = Math.max(0, ...latest.map((p) => p.timestampMilliseconds));
  const o = observationOf(latest.filter((p) => p.timestampMilliseconds === newest), sources.signers, sources.threshold);
  if (o) out.push(o);
  return out;
}

export function createSessionService(input: { sql: Sql | null; sources: RedstoneSources; nowSec?: () => number }): SessionService {
  const nowSec = input.nowSec ?? (() => Math.floor(Date.now() / 1000));
  let agreed: SessionCalendar | null = null;
  let disputed: NextChangeDisagreement[] = [];
  let fetchedMs = 0;
  let inflight: Promise<string> | null = null;

  const doRefresh = async (): Promise<string> => {
    const now = nowSec();
    const today = etDateOf(now);
    const [from, to] = [addDays(today, -DAYS_BACK), addDays(today, DAYS_AHEAD)];
    try {
      const [alpaca, observations] = await Promise.all([fetchAlpacaCalendar(from, to), redstoneObservations(input.sql, input.sources, now - 23 * 3600)]);
      const result = agreeWithRedStone(alpaca, observations);
      agreed = result.calendar;
      disputed = result.disagreements;
      fetchedMs = Date.now();
      const sessions = agreed.sessions.filter((s) => s.date >= today).length;
      return `calendar ${from}..${to}: ${sessions} sessions ahead, ${observations.length} RedStone observations${disputed.length ? `, ${disputed.length} disagreements → unknown ${agreed.unknownDates.join(" ")}` : ", all agree"}`;
    } catch (error) {
      if (agreed && agreed.toDate < today) agreed = null;
      return `calendar refresh failed (${agreed ? "keeping the last agreed calendar" : "no calendar: listing no stock Windows"}): ${errorText(error)}`;
    }
  };

  return {
    calendar: () => agreed,
    status: (sec, halted) => (agreed ? sessionStatus(sec, agreed, { halted: halted ?? false }) : null),
    disagreements: () => disputed,
    refresh(force = false) {
      if (!force && agreed && Date.now() - fetchedMs < REFRESH_MS) return Promise.resolve("calendar fresh");
      inflight ??= doRefresh().finally(() => (inflight = null));
      return inflight;
    },
  };
}
