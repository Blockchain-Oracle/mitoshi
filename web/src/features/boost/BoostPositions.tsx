"use client";
/**
 * The wallet's boosts in the Portfolio (Ported from Masayume 68f7a09:web/src/features/leverage/{LeverageBetRows,
 * LeverageBetRow}.tsx): each live boost with its size, stake, the knock-out line and the mark the book gives it now
 * (rested depth, D-114), the owner's cash-out (sponsored, 1 prompt) with a floor of 97 % of the mark, Settle once the
 * Window has an answer (anyone), and the verdicts: knocked out (by the leverage-keeper, a receipt), cashed out, settled.
 * A payout the owner's receive policy refused is held and collectable (P12). D-227: each is Owarine 90a91d71's
 * `PositionCard` — worth now is what Close pays the owner (the mark less the reserve's front, on the terminal's value
 * engine: `values` from the page), P&L like for like against what is still in (the stake less what it paid back); a
 * closed one is what it paid back against its stake.
 */
import type { Address } from "@cwf/core";
import { PositionCard } from "@/components/data/PositionCard";
import { statusText } from "@/features/terminal/position-return";
import { centsOf } from "@/features/terminal/format";
import type { PositionValue } from "@/features/terminal/usePositionValue";
import { formatBaseUnits } from "@cwf/core/units";
import { USD_DECIMALS } from "@cwf/core";
import { getLeverageMark, listLeveragePositionsOf, readBoostOwed } from "@cwf/markets/leverage";
import { useReadingQuery } from "@cwf/markets/react";
import type { LeveragePosition } from "@cwf/core/leverage";
import SectionHead from "@/components/shell/SectionHead";
import { ReadingBoundary } from "@/components/states";
import { usd } from "../parlay/format";
import { BOOST } from "./copy";
import { boostKeys, useBoostWrites } from "./useBoostWrites";

const B = BOOST.bets;

const dollars = (base: bigint) => Number(base) / 10 ** USD_DECIMALS;

function Row({ p, v, writes, nowSec }: { p: LeveragePosition; v: PositionValue | null; writes: ReturnType<typeof useBoostWrites>; nowSec: number }) {
  const live = p.status === "live";
  const mark = useReadingQuery([...boostKeys.all, "mark", p.positionId.toString()], () => getLeverageMark(p.positionId), { enabled: live, pollMs: 10_000 });
  const m = mark?.ok ? mark.value : null;
  const x = p.leverageBps / 10_000;
  const status = p.status === "knocked-out" ? B.knockedOut : p.status === "closed" ? B.closed : p.status === "settled" ? B.settled : B.live;
  const expired = nowSec >= p.expirySec;
  // Live: what Close pays now and the terminal's P&L; done: what it paid back against the stake.
  const value = live ? (v?.valueBase == null ? null : dollars(v.valueBase)) : dollars(p.returnedBase);
  const invested = dollars(live ? p.stakeBase - p.returnedBase : p.stakeBase);
  const pnl = live ? (v?.pnlBase == null ? null : dollars(v.pnlBase)) : dollars(p.returnedBase - p.stakeBase);
  const pct = live ? (v?.roiBps == null ? null : v.roiBps / 100) : p.stakeBase > 0n ? Number(((p.returnedBase - p.stakeBase) * 10_000n) / p.stakeBase) / 100 : null;
  const action = live && !expired && m ? (
    <button type="button" className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink" disabled={writes.busy === `close:${p.positionId}`} onClick={() => void writes.close(p.positionId, p.marketId, (m.markBase * 97n) / 100n)}>
      {writes.busy === `close:${p.positionId}` ? B.cashingOut : B.cashOut}
    </button>
  ) : live && expired ? (
    <button type="button" className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink" disabled={writes.busy === `settle:${p.positionId}`} onClick={() => void writes.settle(p.positionId, p.marketId)}>
      {writes.busy === `settle:${p.positionId}` ? B.settling : B.settle}
    </button>
  ) : null;
  return (
    <PositionCard
      className={live ? undefined : "opacity-80"}
      title={`${B.boosted(x)} · ${status}`}
      side={p.side}
      value={value}
      invested={invested}
      pnl={pnl}
      pct={pct}
      why={v ? statusText(v.status, p.expirySec, v.fillablePct, v.settled) || undefined : undefined}
      avgIn={centsOf(Number(p.entryPriceRaw / 1_000n))}
      labels={{ worth: live ? B.card.worth : B.card.paid, avgIn: B.card.avgIn, invested: B.card.invested }}
      meta={
        <>
          <span className="numbers">{B.size(formatBaseUnits(p.quantityRaw, USD_DECIMALS, { minDp: 0, maxDp: 2 }), usd(p.stakeBase), usd(p.frontedBase))}</span>
          {live && m ? <span className="numbers block">{m.knockable ? B.knockable : B.line(usd(m.lineBase))}</span> : null}
        </>
      }
      action={action}
    />
  );
}

export function BoostPositions({ wallet, index, values }: { wallet: Address; index: string; values?: ReadonlyMap<string, PositionValue> }) {
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
              <Row key={p.positionId.toString()} p={p} v={values?.get(`b:${p.positionId}`) ?? null} writes={writes} nowSec={nowSec} />
            ))}
          </div>
        )}
      </ReadingBoundary>
    </section>
  );
}
