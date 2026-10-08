"use client";
/**
 * The wallet's boosts in the Portfolio (Ported from Masayume 68f7a09:web/src/features/leverage/{LeverageBetRows,
 * LeverageBetRow}.tsx): each live boost with its size, stake, the knock-out line and the mark the book gives it now
 * (rested depth, D-114), the owner's cash-out (sponsored, 1 prompt) with a floor of 97 % of the mark, Settle once the
 * Window has an answer (anyone), and the verdicts: knocked out (by the leverage-keeper, a receipt), cashed out, settled.
 * A payout the owner's receive policy refused is held and collectable (P12).
 */
import type { Address } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { USD_DECIMALS } from "@cwf/core";
import { getLeverageMark, listLeveragePositionsOf, readBoostOwed } from "@cwf/markets/leverage";
import { useReadingQuery } from "@cwf/markets/react";
import type { LeveragePosition } from "@cwf/core/leverage";
import SectionHead from "@/components/shell/SectionHead";
import { ReadingBoundary } from "@/components/states";
import { cn } from "@/lib/utils";
import { usd } from "../parlay/format";
import { BOOST } from "./copy";
import { boostKeys, useBoostWrites } from "./useBoostWrites";

const B = BOOST.bets;

function Row({ p, writes, nowSec }: { p: LeveragePosition; writes: ReturnType<typeof useBoostWrites>; nowSec: number }) {
  const live = p.status === "live";
  const mark = useReadingQuery([...boostKeys.all, "mark", p.positionId.toString()], () => getLeverageMark(p.positionId), { enabled: live, pollMs: 10_000 });
  const m = mark?.ok ? mark.value : null;
  const x = p.leverageBps / 10_000;
  const status = p.status === "knocked-out" ? B.knockedOut : p.status === "closed" ? B.closed : p.status === "settled" ? B.settled : B.live;
  const expired = nowSec >= p.expirySec;
  return (
    <article className={cn("flex flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-4", !live && "opacity-80")} aria-label={`${B.boosted(x)} #${p.positionId}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="type-body-strong text-ink">{B.boosted(x)} · {p.side === "up" ? "▲ UP" : "▼ DOWN"}</span>
        <span className="type-label-micro text-ink-secondary">{status}</span>
      </div>
      <p className="numbers type-caption text-ink-secondary">
        {B.size(formatBaseUnits(p.quantityRaw, USD_DECIMALS, { minDp: 0, maxDp: 2 }), usd(p.stakeBase), usd(p.frontedBase))}
      </p>
      {live && m ? <p className="numbers type-caption text-ink">{m.knockable ? B.knockable : B.lineMark(usd(m.lineBase), usd(m.markBase))}</p> : null}
      {!live ? <p className="numbers type-caption text-ink">{p.returnedBase > 0n ? B.paid(usd(p.returnedBase)) : B.nothingBack}</p> : null}
      {live && !expired && m ? (
        <button type="button" className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink" disabled={writes.busy === `close:${p.positionId}`} onClick={() => void writes.close(p.positionId, p.marketId, (m.markBase * 97n) / 100n)}>
          {writes.busy === `close:${p.positionId}` ? B.cashingOut : B.cashOut}
        </button>
      ) : null}
      {live && expired ? (
        <button type="button" className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink" disabled={writes.busy === `settle:${p.positionId}`} onClick={() => void writes.settle(p.positionId, p.marketId)}>
          {writes.busy === `settle:${p.positionId}` ? B.settling : B.settle}
        </button>
      ) : null}
    </article>
  );
}

export function BoostPositions({ wallet, index }: { wallet: Address; index: string }) {
  const writes = useBoostWrites(wallet);
  const reading = useReadingQuery([...boostKeys.all, "positions", wallet], () => listLeveragePositionsOf(wallet), { pollMs: 10_000 });
  const owed = useReadingQuery([...boostKeys.all, "owed", wallet], () => readBoostOwed(wallet), { pollMs: 30_000 });
  const nowSec = Math.floor(Date.now() / 1000);
  return (
    <section aria-label={B.title} className="flex flex-col gap-3">
      <SectionHead number={index} title={B.title} />
      {owed?.ok && owed.value > 0n ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-strong p-3">
          <p className="type-caption text-ink">{B.owed(usd(owed.value))}</p>
          <button type="button" className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink" onClick={() => void writes.claimOwed()}>{B.collect(usd(owed.value))}</button>
        </div>
      ) : null}
      <ReadingBoundary reading={reading} shape="row" isEmpty={(ps) => ps.length === 0} empty={{ why: B.empty }}>
        {(positions) => (
          <div className="flex flex-col gap-3">
            {positions.map((p) => (
              <Row key={p.positionId.toString()} p={p} writes={writes} nowSec={nowSec} />
            ))}
          </div>
        )}
      </ReadingBoundary>
    </section>
  );
}
