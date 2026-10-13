"use client";
/**
 * The wallet's rounds (Ported from Masayume 68f7a09:web/src/features/range/{RangeSlip,RangeCard}.tsx): live first, the
 * band (or a Moonshot's one edge), the opening and closing prints, then Settle (anyone, once the engine has answered),
 * the stale void (only while the engine has no answer past the grace — `MustSettle` otherwise, D-108/D-172), the claim
 * (pays the owner only) or the verdict. A payout the owner's receive policy refused is held and collectable. A void
 * returns the stake, so it reads neutral, not lost (D-227).
 * R4-5 (D-227, Ported from Owarine 90a91d71:web/src/features/range/RangeSlip.tsx `kind`): each page lists only its own
 * rounds (`kind`), filtered before the empty check so a wallet with only bands sees Moonshot's empty line, not a blank;
 * `useRoundsSummary` feeds the head's "Rounds · n" / "Claim $X" chip.
 */
import { formatCadence } from "@cwf/core/copy";
import { classifyRangeBand } from "@cwf/core/range";
import type { Address } from "@cwf/core";
import { listRangeRoundViews, readRangeOwed, type RangeRoundView } from "@cwf/markets/range";
import type { Reading } from "@cwf/core";
import { useReadingQuery } from "@cwf/markets/react";
import { ReadingBoundary } from "@/components/states";
import { cn } from "@/lib/utils";
import { formatMultiplier, usd } from "../parlay/format";
import { RANGE } from "./copy";
import { rangeKeys } from "./data";
import { usdBand } from "./format";
import type { useRangeWrites } from "./useRangeWrites";

const R = RANGE.rounds;

function Round({ r, nowSec, staleAfterSec, writes }: { r: RangeRoundView; nowSec: number; staleAfterSec: number; writes: ReturnType<typeof useRangeWrites> }) {
  const kind = classifyRangeBand(r.openingPrint, r.lowPrint, r.highPrint);
  const bandText = kind.kind === "moonshot" ? R.target(kind.direction, usdBand(kind.strikePrint)) : R.band(usdBand(r.lowPrint), usdBand(r.highPrint), r.side);
  const pill = r.status === "won" ? R.won : r.status === "claimed" ? R.paid : r.status === "lost" ? R.lost : r.status === "void" ? R.voided : R.inPlay;
  const milli = Number((r.maxPayoutBase * 1000n) / (r.stakeBase || 1n));
  const stale = r.status === "live" && !r.answered && nowSec > r.expirySec + staleAfterSec;
  return (
    <article className={cn("pl-card", r.status === "won" && "pl-card--won", r.status === "lost" && "pl-card--lost", r.status === "void" && "pl-card--void")} aria-label={`${r.asset ?? ""} range #${r.roundId}`}>
      <div className="pl-card-head">
        <div className="pl-card-name">
          <span className="pl-card-streak">{r.asset ?? "…"} {r.intervalSec !== null ? formatCadence(r.intervalSec) : ""}</span>
          <span className={cn("pl-pill", (r.status === "won" || r.status === "claimed") && "pl-pill--won", r.status === "lost" && "pl-pill--dead", r.status === "void" && "pl-pill--void")}>{pill}</span>
        </div>
        <div className="pl-card-right">
          <div className="pl-card-x numbers">{formatMultiplier(milli)}</div>
          <div className="pl-card-sub numbers">{usd(r.stakeBase)} → {usd(r.maxPayoutBase)}</div>
        </div>
      </div>
      <p className="pl-cleg-name">{bandText}</p>
      <p className="pl-card-sub numbers">
        {R.opening(usdBand(r.openingPrint))}
        {r.closingPrint !== null ? ` · ${R.closed(usdBand(r.closingPrint), r.closingPrint >= r.lowPrint && r.closingPrint <= r.highPrint)}` : ""}
      </p>
      {r.status === "live" && r.answered ? (
        <button type="button" className="pl-settle min-h-touch mt-3" disabled={writes.busy === `settle:${r.roundId}`} onClick={() => void writes.settle(r.roundId, r.marketId)}>
          {writes.busy === `settle:${r.roundId}` ? R.settling : R.settle}
        </button>
      ) : null}
      {stale ? (
        <button type="button" className="pl-settle min-h-touch mt-3" onClick={() => void writes.voidStale(r.roundId)}>{R.voidStale}</button>
      ) : null}
      {r.status === "won" ? (
        <button type="button" className="pl-claim min-h-touch" disabled={writes.busy === `claim:${r.roundId}`} onClick={() => void writes.claim(r.roundId, r.maxPayoutBase)}>
          {writes.busy === `claim:${r.roundId}` ? R.claiming : R.claim(usd(r.maxPayoutBase))}
        </button>
      ) : null}
      {r.status === "lost" ? <p className="pl-card-note">{R.lostNote}</p> : null}
      {r.status === "void" ? <p className="pl-card-note">{R.voidedNote}</p> : null}
      {r.status === "claimed" ? <p className="pl-card-note">{R.paidNote}</p> : null}
    </article>
  );
}

export type RoundKind = "range" | "moonshot";
const kindOf = (r: RangeRoundView): RoundKind => (classifyRangeBand(r.openingPrint, r.lowPrint, r.highPrint).kind === "moonshot" ? "moonshot" : "range");

function useRounds(wallet: Address | null, kind: RoundKind): Reading<RangeRoundView[]> | null {
  const reading = useReadingQuery(rangeKeys.rounds(wallet), () => listRangeRoundViews(wallet as Address), { pollMs: 8_000, enabled: wallet !== null });
  return reading && reading.ok ? { ...reading, value: reading.value.filter((r) => kindOf(r) === kind) } : reading;
}

/** The head chip's figures: how many rounds this page has, and what the won ones pay when claimed. */
export function useRoundsSummary(wallet: Address | null, kind: RoundKind): { count: number; claimBase: bigint } {
  const reading = useRounds(wallet, kind);
  const rounds = reading && reading.ok ? reading.value : [];
  return { count: rounds.length, claimBase: rounds.filter((r) => r.status === "won").reduce((sum, r) => sum + r.maxPayoutBase, 0n) };
}

export function RangeRounds({ wallet, nowMs, staleAfterSec, writes, onSignIn, kind }: { wallet: Address | null; nowMs: number; staleAfterSec: number; writes: ReturnType<typeof useRangeWrites>; onSignIn: () => void; kind: RoundKind }) {
  const reading = useRounds(wallet, kind);
  const owed = useReadingQuery([...rangeKeys.all, "owed", wallet], () => readRangeOwed(wallet as Address), { pollMs: 30_000, enabled: wallet !== null });
  if (!wallet) {
    return (
      <div className="pl-slip-empty">
        <p>{R.signIn}</p>
        <button type="button" onClick={onSignIn} className="mt-3 min-h-touch rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{R.signInCta}</button>
      </div>
    );
  }
  const nowSec = Math.floor(nowMs / 1000);
  return (
    <>
      {owed?.ok && owed.value > 0n ? (
        <div role="status" className="pl-owed">
          <p>{R.owed(usd(owed.value))}</p>
          <button type="button" className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink" onClick={() => void writes.claimOwed()}>{R.claim(usd(owed.value))}</button>
        </div>
      ) : null}
      <ReadingBoundary reading={reading} shape="row" isEmpty={(rs) => rs.length === 0} empty={{ why: kind === "moonshot" ? R.emptyMoonshot : R.empty }}>
        {(rounds) => (
          <div className="pl-slip">
            {rounds.map((r) => (
              <Round key={r.roundId.toString()} r={r} nowSec={nowSec} staleAfterSec={staleAfterSec} writes={writes} />
            ))}
          </div>
        )}
      </ReadingBoundary>
    </>
  );
}
