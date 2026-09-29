/**
 * The `calendar` actor (plan C.5.2 "calendar (RedStone schedule ∩ Alpaca)"): refreshes the shared session service
 * hourly, heartbeats the agreement (sessions ahead, disagreements, unknown dates) and publishes `/session` to the stream
 * whenever the state changes. The roller, maker and halt-watch read the same service.
 */
import { runActor, type VenueDeps } from "../runtime";
import { sessionBody } from "../http/session";

export function startCalendar(deps: VenueDeps): { stop: () => void } {
  let last = "";
  return runActor({
    name: "calendar", log: deps.log, dryRun: false, everyMs: 60_000,
    pass: async () => {
      const note = await deps.sessions.refresh();
      const nowSec = Math.floor(Date.now() / 1000);
      const body = sessionBody({ sessions: deps.sessions, halts: deps.halts, events: deps.events }, nowSec);
      const state = `${body.status?.state ?? "none"}:${body.calendar?.unknownDates.join(",") ?? ""}`;
      if (state !== last) deps.bus.publish("session", "session", body);
      last = state;
      const cal = deps.sessions.calendar();
      if (!cal) return { why: `no agreed calendar: stock lanes list nothing · ${note}`, detail: { calendar: null } };
      return {
        why: `${body.label ?? body.status?.state ?? "?"} · ${cal.sessions.filter((s) => s.closeSec > nowSec).length} sessions ahead · ${deps.sessions.disagreements().length} disagreements${cal.unknownDates.length ? ` (unknown ${cal.unknownDates.join(" ")})` : ""}${note === "calendar fresh" ? "" : ` · ${note}`}`,
        detail: { status: body.status, unknownDates: cal.unknownDates, disagreements: deps.sessions.disagreements() },
      };
    },
  });
}
