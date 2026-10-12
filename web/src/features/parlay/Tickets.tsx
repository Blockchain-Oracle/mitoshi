"use client";
/**
 * The wallet's tickets (Ported from Masayume 68f7a09:web/src/features/parlay/{ParlaySlip,ParlayCard}.tsx): live first,
 * each leg flipping as its Window settles; the streak, its pill, the multiplier, the legs, then the claim or the
 * verdict. Tempo changes: D-108 — only the next leg in close order offers Settle (a later leg that has settled reads
 * "waits its turn"); the settle and the claim are sponsored and pay only the owner; a claim the owner's receive policy
 * refused is held as owed and says so. A void returns the stake, so it reads neutral, not dead (D-227).
 */
import { SETTLING } from "@cwf/core/copy";
import { formatCadence } from "@cwf/core/copy";
import type { Address } from "@cwf/core";
import { formatClock } from "@cwf/core/units";
import type { ParlayTicketView } from "@cwf/markets/parlay";
import { Check, Clock, Layers, Loader2, Minus, Trophy, X } from "lucide-react";
import { ReadingBoundary } from "@/components/states";
import { cn } from "@/lib/utils";
import { usd0 } from "../markets/units";
import { PARLAY } from "./copy";
import { useParlayTickets } from "./data";
import { formatMultiplier, usd } from "./format";
import type { BusyKey } from "./useParlayWrites";

const T = PARLAY.tickets;

function LegState({ ticket, idx, nowMs, busy, onSettle }: { ticket: ParlayTicketView; idx: number; nowMs: number; busy: boolean; onSettle: () => void }) {
  const leg = ticket.legs[idx]!;
  if (leg.status === "won") return <>{T.legWon}</>;
  if (leg.status === "lost") return <>{T.legMissed}</>;
  if (leg.status === "void") return <>{T.legVoid}</>;
  if (ticket.status !== "live") return <>—</>;
  if (leg.settledOnchain && ticket.nextLegIdx === idx) {
    return (
      <button type="button" onClick={onSettle} disabled={busy} className="pl-settle min-h-touch">
        {busy ? T.settling : T.settle}
      </button>
    );
  }
  if (leg.settledOnchain) return <>{T.waitsTurn}</>;
  const left = Math.max(0, leg.expirySec - Math.floor(nowMs / 1000));
  return <>{left === 0 ? SETTLING : formatClock(left)}</>;
}

const DOT = { won: Check, lost: X, void: Minus, pending: Clock } as const;

function Card({ ticket, nowMs, busy, onSettle, onClaim }: { ticket: ParlayTicketView; nowMs: number; busy: BusyKey | null; onSettle: (t: ParlayTicketView, i: number) => void; onClaim: (t: ParlayTicketView) => void }) {
  const { status } = ticket;
  const claiming = busy === `claim:${ticket.parlayId}`;
  const milli = Number((ticket.maxPayoutBase * 1000n) / (ticket.stakeBase || 1n));
  const pill = status === "won" ? T.won : status === "claimed" ? T.paid : status === "lost" ? T.dead : status === "void" ? T.voided : T.inPlay(ticket.wonCount, ticket.legs.length);
  return (
    <article className={cn("pl-card pl-rise", status === "won" && "pl-card--won", status === "lost" && "pl-card--lost", status === "void" && "pl-card--void")} aria-label={`${T.streak(ticket.legs.length)} #${ticket.parlayId}`}>
      <div className="pl-card-head">
        <div className="pl-card-name">
          <Layers aria-hidden className="size-3.5" />
          <span className="pl-card-streak">{T.streak(ticket.legs.length)}</span>
          <span className={cn("pl-pill", (status === "won" || status === "claimed") && "pl-pill--won", status === "lost" && "pl-pill--dead", status === "void" && "pl-pill--void")}>{pill}</span>
        </div>
        <div className="pl-card-right">
          <div className="pl-card-x numbers">{formatMultiplier(milli)}</div>
          <div className="pl-card-sub numbers">{usd(ticket.stakeBase)} → {usd(ticket.maxPayoutBase)}</div>
        </div>
      </div>
      <ol className="pl-card-legs">
        {ticket.legs.map((leg, i) => {
          const Icon = DOT[leg.status];
          return (
            <li key={i} className="pl-cleg">
              <span className="pl-cleg-idx numbers">{String(i + 1).padStart(2, "0")}</span>
              <span className={cn("pl-cleg-dot", leg.status !== "pending" && `pl-cleg-dot--${leg.status}`)} aria-hidden>
                <Icon className="size-3" strokeWidth={3} />
              </span>
              <span className="pl-cleg-main pl-cleg-name">
                {leg.asset ?? "…"} {leg.intervalSec !== null ? formatCadence(leg.intervalSec) : ""}{" "}
                <span className={leg.side === "up" ? "pl-cleg-side--up" : "pl-cleg-side--down"}>{leg.side === "up" ? "▲ UP" : "▼ DOWN"}</span>
                {leg.openingPriceE8 !== null ? <span className="pl-cleg-line"> · {usd0(leg.openingPriceE8)}</span> : null}
              </span>
              <span className={cn("pl-cleg-state numbers", leg.status === "won" ? "pl-cleg-state--won" : leg.status === "pending" ? "pl-cleg-state--pending" : "pl-cleg-state--lost")}>
                <LegState ticket={ticket} idx={i} nowMs={nowMs} busy={busy === `settle:${ticket.parlayId}:${i}`} onSettle={() => onSettle(ticket, i)} />
              </span>
            </li>
          );
        })}
      </ol>
      {status === "won" ? (
        <button type="button" onClick={() => onClaim(ticket)} disabled={claiming} className="pl-claim min-h-touch">
          {claiming ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Trophy aria-hidden className="size-4" />}
          {claiming ? T.claiming : T.claim(usd(ticket.maxPayoutBase))}
        </button>
      ) : null}
      {status === "lost" ? <p className="pl-card-note">{T.lost}</p> : null}
      {status === "void" ? <p className="pl-card-note">{T.voidedNote}</p> : null}
      {status === "claimed" ? <p className="pl-card-note">{T.paidNote}</p> : null}
    </article>
  );
}

export function Tickets({ wallet, nowMs, busy, onSettle, onClaim, onSignIn }: { wallet: Address | null; nowMs: number; busy: BusyKey | null; onSettle: (t: ParlayTicketView, i: number) => void; onClaim: (t: ParlayTicketView) => void; onSignIn: () => void }) {
  const reading = useParlayTickets(wallet);
  if (!wallet) {
    return (
      <div className="pl-slip-empty">
        <p>{T.signIn}</p>
        <button type="button" onClick={onSignIn} className="mt-3 min-h-touch rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{PARLAY.cta.signIn}</button>
      </div>
    );
  }
  return (
    <ReadingBoundary reading={reading} shape="row" isEmpty={(t) => t.length === 0} empty={{ why: T.empty }}>
      {(tickets) => (
        <div className="pl-slip">
          {tickets.map((t) => (
            <Card key={t.parlayId.toString()} ticket={t} nowMs={nowMs} busy={busy} onSettle={onSettle} onClaim={onClaim} />
          ))}
        </div>
      )}
    </ReadingBoundary>
  );
}
