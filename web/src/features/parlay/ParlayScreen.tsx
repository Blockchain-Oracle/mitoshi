"use client";
/**
 * `/parlay` (Ported from Masayume 68f7a09:web/src/features/parlay/ParlayScreen.tsx — `reference/yosuku/app/parlay/
 * page.tsx`): the hero, §01 the builder (the live Windows beside the slip — E.4's composition), §02 your tickets,
 * §03 how a parlay pays. A reserve that isn't deployed on this network says so; a paused reserve still settles and pays.
 */
import { isOk, type ParlayReserveState } from "@cwf/core";
import { readParlayOwed, type ParlayTicketView } from "@cwf/markets/parlay";
import { useReadingQuery } from "@cwf/markets/react";
import { SectionHead } from "@/components/shell";
import { EmptyState, ReadingBoundary } from "@/components/states";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { PARLAY } from "./copy";
import { parlayKeys, useParlayReserve, useParlayWindows } from "./data";
import { usd } from "./format";
import { SlipDock } from "./SlipDock";
import { SlipProvider } from "./slip-state";
import { Tickets } from "./Tickets";
import { useParlayWrites } from "./useParlayWrites";
import { WindowList } from "./WindowList";

function Owed({ wallet }: { wallet: string }) {
  const reading = useReadingQuery([...parlayKeys.all, "owed", wallet], () => readParlayOwed(wallet as `0x${string}`), { pollMs: 30_000 });
  const writes = useParlayWrites(wallet as `0x${string}`);
  if (!reading || !isOk(reading) || reading.value === 0n) return null;
  return (
    <div role="status" className="pl-owed">
      <p>{PARLAY.tickets.owed(usd(reading.value))}</p>
      <button type="button" className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink" onClick={() => void writes.claimOwed()}>
        {PARLAY.tickets.claim(usd(reading.value))}
      </button>
    </div>
  );
}

function Page({ reserve }: { reserve: ParlayReserveState }) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const { windows, loading } = useParlayWindows(nowMs);
  const writes = useParlayWrites(session.address);
  const { sections } = PARLAY;
  const onSettle = (t: ParlayTicketView, i: number) => void writes.settleLeg(t.parlayId, i, t.legs[i]!.marketId);
  const onClaim = (t: ParlayTicketView) => void writes.claim(t.parlayId, t.maxPayoutBase);
  return (
    <SlipProvider windows={windows} maxLegs={reserve.params.maxLegs}>
      <div className="pl-hero">
        <span className="pl-eyebrow">{PARLAY.eyebrow}</span>
        <h1 className="page-title">
          {PARLAY.title}
          <span className="accent">.</span>
        </h1>
      </div>

      <section className="pl-block" aria-label={sections.build.title}>
        <SectionHead number={sections.build.number} title={sections.build.title} desc={sections.build.desc} />
        <div className="pl-block-body pl-grid">
          <div className="pl-windows">
            <h2 className="type-label-micro text-ink-secondary">{PARLAY.windows.title}</h2>
            <p className="type-caption text-ink-secondary">{PARLAY.windows.desc}</p>
            <WindowList windows={windows} loading={loading} nowMs={nowMs} />
          </div>
          <SlipDock reserve={reserve} windows={windows} />
        </div>
      </section>

      <section className="pl-block" aria-label={sections.tickets.title}>
        <SectionHead number={sections.tickets.number} title={sections.tickets.title} desc={sections.tickets.desc} />
        <div className="pl-block-body">
          {session.address ? <Owed wallet={session.address} /> : null}
          <Tickets wallet={session.address} nowMs={nowMs} busy={writes.busy} onSettle={onSettle} onClaim={onClaim} onSignIn={session.connect} />
        </div>
      </section>

      <section className="pl-block" aria-label={sections.how.title}>
        <SectionHead number={sections.how.number} title={sections.how.title} />
        <div className="pl-block-body pl-how">
          {PARLAY.how.map((c) => (
            <div key={c.n} className="pl-how-card">
              <div className="pl-how-n" aria-hidden>{c.n}</div>
              <h3 className="pl-how-t">{c.t}</h3>
              <p className="pl-how-d">{c.d}</p>
            </div>
          ))}
          <p className="pl-how-d pl-trophy">{PARLAY.trophy}</p>
        </div>
      </section>
    </SlipProvider>
  );
}

export function ParlayScreen() {
  const reading = useParlayReserve();
  return (
    <div className="container px-gutter pl-page lg:px-gutter-desktop">
      <ReadingBoundary reading={reading} shape="plate">
        {(reserve) => (reserve ? <Page reserve={reserve} /> : <EmptyState why={PARLAY.notDeployed.why} detail={PARLAY.notDeployed.body} />)}
      </ReadingBoundary>
    </div>
  );
}
