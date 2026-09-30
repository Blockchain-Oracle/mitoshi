"use client";
/**
 * `/games/range` (Ported from Masayume 68f7a09:web/src/features/range/RangeScreen.tsx — "its Ticket's range mode on the
 * parlay page's frame"): §01 a Window and the band (inside or outside), §02 your rounds, §03 how a range pays. Windows
 * the reserve can't price are listed with the reason, never offered then refused.
 */
import type { RangeReserveState } from "@cwf/core/range";
import { formatCadence } from "@cwf/core/copy";
import { useState } from "react";
import { SectionHead } from "@/components/shell";
import { EmptyState, LoadingState, ReadingBoundary } from "@/components/states";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { RANGE } from "./copy";
import { useRangeReserve, useRangeWindows } from "./data";
import { RangeRounds } from "./RangeRounds";
import { RangeTicketBody } from "./RangeTicketBody";
import { useRangeWrites } from "./useRangeWrites";

function Page({ reserve }: { reserve: RangeReserveState }) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const writes = useRangeWrites(session.address);
  const { windows, loading } = useRangeWindows(nowMs, reserve.params.minTimeLeftSec);
  const priced = windows.filter((w) => w.model !== null);
  const [picked, setPicked] = useState<string | null>(null);
  const current = priced.find((w) => w.market.marketId === picked) ?? priced[0] ?? null;
  const unpriced = [...new Set(windows.filter((w) => w.model === null).map((w) => w.market.asset))];
  const { sections } = RANGE;
  return (
    <>
      <div className="pl-hero">
        <span className="pl-eyebrow">{RANGE.eyebrow}</span>
        <h1 className="page-title">
          {RANGE.title}
          <span className="accent">.</span>
        </h1>
      </div>
      <section className="pl-block" aria-label={sections.build.title}>
        <SectionHead number={sections.build.number} title={sections.build.title} desc={sections.build.desc} />
        <div className="pl-block-body grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-3">
            {loading && priced.length === 0 ? <LoadingState shape="row" label={RANGE.band.waiting} /> : null}
            {!loading && priced.length === 0 ? <EmptyState why={RANGE.windows.none} /> : null}
            {priced.length > 0 ? (
              <SegmentedControl<string>
                label={RANGE.windows.label}
                value={current?.market.marketId ?? ""}
                onValueChange={setPicked}
                options={priced.slice(0, 4).map((w) => ({ value: w.market.marketId, label: `${w.market.asset} ${formatCadence(w.market.intervalSec)}` }))}
              />
            ) : null}
            {unpriced.length > 0 ? <p className="type-caption text-ink-secondary">{RANGE.windows.noModel(unpriced.join(", "))}</p> : null}
          </div>
          <div className="pl-rail">{current ? <RangeTicketBody key={current.market.marketId} market={current.market} model={current.model} reserve={reserve} allowOutside /> : null}</div>
        </div>
      </section>
      <section className="pl-block" aria-label={sections.rounds.title}>
        <SectionHead number={sections.rounds.number} title={sections.rounds.title} desc={sections.rounds.desc} />
        <div className="pl-block-body">
          <RangeRounds wallet={session.address} nowMs={nowMs} staleAfterSec={reserve.params.staleAfterSec} writes={writes} onSignIn={session.connect} />
        </div>
      </section>
      <section className="pl-block" aria-label={sections.how.title}>
        <SectionHead number={sections.how.number} title={sections.how.title} />
        <div className="pl-block-body pl-how">
          {RANGE.how.map((c) => (
            <div key={c.n} className="pl-how-card">
              <div className="pl-how-n" aria-hidden>{c.n}</div>
              <h3 className="pl-how-t">{c.t}</h3>
              <p className="pl-how-d">{c.d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function RangeScreen() {
  const reading = useRangeReserve();
  return (
    <div className="container px-gutter pl-page lg:px-gutter-desktop">
      <ReadingBoundary reading={reading} shape="plate">
        {(reserve) => (reserve ? <Page reserve={reserve} /> : <EmptyState why={RANGE.notDeployed} />)}
      </ReadingBoundary>
    </div>
  );
}
