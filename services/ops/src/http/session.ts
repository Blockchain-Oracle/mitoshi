// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/http/session.ts (Pyth trial/index sources dropped; RedStone disagreements added).
/**
 * `GET /session`: the agreed NYSE calendar's state now, the next sessions, the roller's lane states, halts, earnings and
 * corporate skips, so web can say "Opens Mon 09:30 ET" or "Paused: no signed source" without its own calendar keys.
 */
import { addDays, etDateOf, sessionLabel } from "@cwf/core";
import type { SessionService } from "../calendar/session-service";
import type { HaltBoardStore } from "../runtime/halt-board";
import { heartbeats } from "../runtime/heartbeat";
import type { SessionEvents } from "../runtime/session-events";

const UPCOMING = 5;
const RECENT = 5;

/** Why prints stall, in the app's three words: the price network refuses us, hasn't signed T yet, or can't be reached. */
export type PrintStallKind = "refused" | "unsigned" | "unreachable";

export interface PrintsState {
  /** Median seconds from a Window's start to its opening print, over the relay's last opens; null before any. */
  openLagSec: number | null;
  /** Due prints waiting on the price network for over 20 s: since when (the oldest T) and why; null while they land. */
  stall: { sinceSec: number; kind: PrintStallKind } | null;
}

export function stallKind(reason: string): PrintStallKind {
  if (/public_gateway_rejected|HTTP 40[13]|HTTP 429|blocked|resting/i.test(reason)) return "refused";
  if (/signers|not signed|no gateway data/i.test(reason)) return "unsigned";
  return "unreachable";
}

/** The price relay's word on the prints (`price-relay` heartbeat detail), for the app's "waiting for the line" state. */
export function printsState(detail: Record<string, unknown> | undefined): PrintsState {
  const lag = detail?.openLagSec as { p50?: unknown } | null | undefined;
  const stall = detail?.stall as { sinceSec?: unknown; reason?: unknown } | null | undefined;
  return {
    openLagSec: typeof lag?.p50 === "number" ? lag.p50 : null,
    stall: stall && typeof stall.sinceSec === "number" ? { sinceSec: stall.sinceSec, kind: stallKind(String(stall.reason ?? "")) } : null,
  };
}

export function sessionBody(input: { sessions: SessionService | null; halts: HaltBoardStore | null; events: SessionEvents | null }, nowSec = Math.floor(Date.now() / 1000)) {
  const calendar = input.sessions?.calendar() ?? null;
  const status = input.sessions?.status(nowSec) ?? null;
  const roller = heartbeats().find((b) => b.actor === "window-roller");
  const relay = heartbeats().find((b) => b.actor === "price-relay");
  return {
    nowSec,
    status,
    label: status ? sessionLabel(status) : null,
    calendar: calendar
      ? {
          fromDate: calendar.fromDate,
          toDate: calendar.toDate,
          unknownDates: calendar.unknownDates,
          upcoming: calendar.sessions.filter((s) => s.closeSec > nowSec).slice(0, UPCOMING),
          recent: calendar.sessions.filter((s) => s.openSec <= nowSec).slice(-RECENT),
        }
      : null,
    /** Alpaca ∩ RedStone `NY_MARKET_NEXT_CHANGE_TIME` disagreements behind any unknown date. */
    disagreements: input.sessions?.disagreements() ?? [],
    lanes: (roller?.detail.lanes as Record<string, string> | undefined) ?? {},
    halts: input.halts?.board() ?? {},
    /** Report dates 14 days ahead; null until the first fetch ("unknown", never "none"). */
    earnings: input.events?.earnings() ?? null,
    skips: (input.events?.skips() ?? []).filter((k) => k.date >= addDays(etDateOf(nowSec), -3)),
    /** D-230: how long the opening print usually takes, and whether prints are stalled on the price network. */
    prints: printsState(relay?.detail),
  };
}
