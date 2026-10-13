"use client";
// Ported from Owarine 90a91d71:web/src/features/desk/cockpit/CheckStrip.tsx (R4-6, D-227) — the card beside the record:
// a ring to the agent's next read and the runner's last heartbeat, its report folded. An agent reads a Window once, in
// its decision slot (core `decisionSlot`) on the live Windows of its series and cadences (the lanes read); a rule or a
// mirror reads every runner pass, so its ring runs to the next heartbeat.
import { decisionSlot, isOk, phase, type EventMarket } from "@cwf/core";
import { useLanes } from "@cwf/markets/react";
import { CountdownRing } from "@/components/data/CountdownRing";
import { useNowMs } from "@/components/data/useNowMs";
import { runnerLabelOf } from "../strategies/activity";
import { ago } from "../strategies/names";
import type { StrategyWire } from "../strategies/protocol";
import { AGENTS } from "./copy";

const N = AGENTS.cockpit.next;
const LATE_GRACE_SEC = 60;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;

function nextSlot(s: StrategyWire, markets: readonly EventMarket[], nowMs: number): { atSec: number; spanSec: number; open: boolean } | null {
  const spec = s.spec;
  if (!spec || spec.preset !== "agent") return null;
  const series = s.envelope.series?.toLowerCase() ?? null;
  const mine = markets.filter((m) => (series ? m.seriesId.toLowerCase() === series : true) && spec.cadences.includes(m.intervalSec) && phase(m, nowMs) === "trading");
  const slots = mine.map((m) => ({ m, slot: decisionSlot(m, nowMs) })).filter(({ slot }) => slot.closesAtSec * 1000 > nowMs);
  const open = slots.find(({ slot }) => slot.open);
  if (open) return { atSec: open.slot.closesAtSec, spanSec: open.slot.closesAtSec - open.slot.opensAtSec, open: true };
  const soon = slots.sort((a, b) => a.slot.opensAtSec - b.slot.opensAtSec)[0];
  return soon ? { atSec: soon.slot.opensAtSec, spanSec: soon.m.intervalSec, open: false } : null;
}

export function NextRead({ s }: { s: StrategyWire }) {
  const nowMs = useNowMs();
  const lanes = useLanes();
  const markets = lanes && isOk(lanes) ? lanes.value.lanes.flatMap((l) => l.markets) : [];
  const nowSec = Math.floor(nowMs / 1000);
  const agentSlot = nextSlot(s, markets, nowMs);
  const beat = s.health.lastTickMs !== null && s.health.intervalMs !== null ? { atSec: Math.floor((s.health.lastTickMs + s.health.intervalMs) / 1000), spanSec: Math.floor(s.health.intervalMs / 1000), open: false } : null;
  const due = s.spec?.preset === "agent" ? agentSlot : beat;
  // A heartbeat past its time (beyond this page's 30 s refresh and the runner's own pass) means the runner is late:
  // say so, never a ring parked at 0:00.
  const late = due !== null && !due.open && due.atSec + LATE_GRACE_SEC <= nowSec;
  const next = late ? null : due;
  const left = next ? Math.max(0, next.atSec - nowSec) : 0;
  return (
    <section className="cp-card cp-check" aria-label={N.title}>
      <span className="cp-stat-label">{N.title}</span>
      <div className="cp-check-main">
        <CountdownRing fraction={next ? left / Math.max(1, next.spanSec) : 0} className="cp-ring">
          <span className="cp-ring-text">{next ? clock(left) : "—"}</span>
        </CountdownRing>
        <div className="cp-check-text">
          <p className="cp-check-lead">{late ? N.late : !next ? (s.spec?.preset === "agent" ? N.none : N.noBeat) : next.open ? N.now(clock(left)) : left === 0 ? N.due : N.in(clock(left))}</p>
          <p className="type-caption text-ink-secondary">{s.health.lastTickMs !== null ? N.beat(ago(s.health.lastTickMs, nowMs)) : N.noBeat}</p>
        </div>
      </div>
      {s.health.why && (
        <details className="cp-report">
          <summary>{runnerLabelOf(s.health.why)}</summary>
          <p>{s.health.why}</p>
        </details>
      )}
    </section>
  );
}
