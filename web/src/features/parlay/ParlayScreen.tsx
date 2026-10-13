"use client";
/**
 * `/parlay` (Ported from Masayume 68f7a09:web/src/features/parlay/ParlayScreen.tsx — `reference/yosuku/app/parlay/
 * page.tsx`): the live Windows beside the slip (E.4's composition), then your tickets. A reserve that isn't deployed
 * on this network says so; a paused reserve still settles and pays.
 * R4-5 (D-227): the 40 px GameHead ("Tickets · n" or "Claim $X" in a sheet, ⓘ how it pays) replaces the hero and the
 * section heads; below 1024 the SlipBar carries the hold above the dock, so building and placing is one screen.
 */
import { isOk, type ParlayReserveState } from "@cwf/core";
import { readParlayOwed, type ParlayTicketView } from "@cwf/markets/parlay";
import { useReadingQuery } from "@cwf/markets/react";
import { formatLeft } from "@/components/kit/CountdownRing";
import { EmptyState, ReadingBoundary } from "@/components/states";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { PARLAY } from "./copy";
import { parlayKeys, useParlayReserve, useParlayTickets, useParlayWindows } from "./data";
import { GameHead } from "../range/GameHead";
import { usd, utilizationPct } from "./format";
import { SlipDock } from "./SlipDock";
import { SlipProvider } from "./slip-state";
import { Tickets } from "./Tickets";
import { useParlayWrites } from "./useParlayWrites";
import { WindowList } from "./WindowList";
import "@/components/kit/kit.css";

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
  const { windows, loading, failure, nextOpenSec: nextOpen } = useParlayWindows(nowMs);
  const writes = useParlayWrites(session.address);
  const tickets = useParlayTickets(session.address);
  const mine = tickets && isOk(tickets) ? tickets.value : [];
  const claimBase = mine.filter((t) => t.status === "won").reduce((sum, t) => sum + t.maxPayoutBase, 0n);
  const onSettle = (t: ParlayTicketView, i: number) => void writes.settleLeg(t.parlayId, i, t.legs[i]!.marketId);
  const onClaim = (t: ParlayTicketView) => void writes.claim(t.parlayId, t.maxPayoutBase);
  const list = (
    <>
      {session.address ? <Owed wallet={session.address} /> : null}
      <Tickets wallet={session.address} nowMs={nowMs} busy={writes.busy} onSettle={onSettle} onClaim={onClaim} onSignIn={session.connect} />
    </>
  );
  return (
    <SlipProvider windows={windows} maxLegs={reserve.params.maxLegs}>
      <GameHead
        title={PARLAY.title}
        chip={claimBase > 0n ? PARLAY.tickets.claim(usd(claimBase)) : PARLAY.head.tickets(mine.length)}
        chipAccent={claimBase > 0n}
        sheetTitle={PARLAY.sections.tickets.title}
        sheet={list}
        infoTitle={PARLAY.info.title}
        how={PARLAY.how}
        facts={
          <>
            <p className="numbers">{PARLAY.reserve(usd(reserve.liquidBase), utilizationPct(reserve.utilizationBps))}</p>
            <p>{PARLAY.info.priced}</p>
          </>
        }
      />
      <div className="pl-grid">
        <div className="pl-windows">
          <WindowList windows={windows} loading={loading} failure={failure} nowMs={nowMs} nextOpenText={nextOpen !== null ? PARLAY.windows.none(formatLeft(nextOpen * 1000 - nowMs)) : PARLAY.windows.noneLater} />
        </div>
        <SlipDock reserve={reserve} windows={windows} />
      </div>
      <section className="game-below" aria-label={PARLAY.sections.tickets.title}>
        <h2 className="game-below-title">{PARLAY.sections.tickets.title}</h2>
        {list}
      </section>
    </SlipProvider>
  );
}

export function ParlayScreen() {
  const reading = useParlayReserve();
  return (
    <div className="game-page pl-page">
      <ReadingBoundary reading={reading} shape="game">
        {(reserve) => (reserve ? <Page reserve={reserve} /> : <EmptyState why={PARLAY.notDeployed.why} detail={PARLAY.notDeployed.body} />)}
      </ReadingBoundary>
    </div>
  );
}
