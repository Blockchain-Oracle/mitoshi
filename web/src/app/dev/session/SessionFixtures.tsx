"use client";
// Ported in purpose from Agari 03b30ab:web/src/app/dev/session/MarketSessionFixtures.tsx (S6): every session state the
// terminal can show, rendered by the same views over canned clocks — the Window chip's cell, the halt banner over
// UP/DOWN and the session blockers under them — for the UX gate (widths, themes) without waiting for a real Monday.
import { HALT_REASONS } from "@cwf/core";
import { blockerLabel } from "@cwf/core/copy";
import { HaltNoticeView } from "@/features/terminal/ui/HaltNotice";
import { SessionCellView } from "@/features/terminal/ui/SessionCell";
import { TradeButtons } from "@/features/terminal/ui/TradeButtons";
import { CLOCK, STATES } from "./fixtures";
import "@/styles/terminal.css";

const BLOCKERS = [
  { kind: "session-closed", ctx: { opensText: "Mon 14:30 (09:30 ET)" } },
  { kind: "halted", ctx: { haltStale: false } },
  { kind: "halted", ctx: { haltStale: true } },
  { kind: "lane-paused", ctx: {} },
  { kind: "corporate-action", ctx: {} },
] as const;

const noop = () => undefined;

export function SessionFixtures() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 text-ink sm:p-8">
      <h1 className="type-title">Session states (S6)</h1>
      <section aria-labelledby="cells" className="flex flex-col gap-3">
        <h2 id="cells" className="type-body-strong">The Window chip&apos;s session cell</h2>
        <ul className="flex flex-col gap-3 rounded-lg p-4" style={{ background: "var(--chart-ground)" }}>
          {STATES.map((s) => (
            <li key={s.name} className="flex flex-col gap-1">
              <span className="type-caption text-ink-secondary">{s.name} · {s.symbol}</span>
              <span><SessionCellView session={s.session} symbol={s.symbol} nowSec={s.nowSec} /></span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="banners" className="flex flex-col gap-3">
        <h2 id="banners" className="type-body-strong">The halt banner over UP/DOWN, by reason</h2>
        {HALT_REASONS.map((reason) => (
          <HaltNoticeView key={reason} halt={{ reason, sinceSec: CLOCK.regularTue - 90 }} symbol="TSLA" nowSec={CLOCK.regularTue} />
        ))}
      </section>
      <section aria-labelledby="blockers" className="flex flex-col gap-3">
        <h2 id="blockers" className="type-body-strong">UP/DOWN carry the session blocker</h2>
        {BLOCKERS.map((b, i) => {
          const note = blockerLabel(b.kind, b.ctx);
          return (
            <div key={i} className="max-w-sm">
              <TradeButtons mode="flat" onUp={noop} onDown={noop} busy={null} upSub={null} downSub={null} upNote={note} downNote={note} />
            </div>
          );
        })}
      </section>
    </main>
  );
}
