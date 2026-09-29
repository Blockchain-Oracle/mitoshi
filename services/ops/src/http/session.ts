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

export function sessionBody(input: { sessions: SessionService | null; halts: HaltBoardStore | null; events: SessionEvents | null }, nowSec = Math.floor(Date.now() / 1000)) {
  const calendar = input.sessions?.calendar() ?? null;
  const status = input.sessions?.status(nowSec) ?? null;
  const roller = heartbeats().find((b) => b.actor === "window-roller");
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
  };
}
