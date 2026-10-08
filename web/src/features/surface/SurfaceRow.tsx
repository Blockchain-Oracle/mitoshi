"use client";
/**
 * One live Window on the surface table (S10e): the 31861 row with its 30538 sparkline of the price since the Window
 * opened against its opening print, the book's UP ask and bid, the guard's model where the Series has one and the
 * book's distance from it, the spread and the depth; expanded, the Window's depth chart (29968, the hero's own) and a
 * way into its ticket. It reports its figures up so the table can sort on them.
 */
import type { EventMarket } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect } from "react";
import { Countdown } from "@/components/data/Countdown";
import { LoadingState } from "@/components/states";
import { TableCell, TableExpandableContent, TableExpandTriggerCell, TableRow } from "@/components/ui/data-table";
import { Sparkline } from "@/components/ui/sparkline";
import { usd0, usd2 } from "../markets/units";
import { SURFACE } from "./copy";
import { useRowFigures, type RowFigures, type SurfaceWindow } from "./useSurface";

const HeroDepth = dynamic(() => import("../markets/hero/HeroDepth"), { ssr: false, loading: () => <LoadingState shape="plate" /> });

export const COLS = 10;
const C = SURFACE.columns;
const cents = (bps: number | null) => (bps === null ? SURFACE.none : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}¢`);
const centsE6 = (e6: bigint | null) => (e6 === null ? null : Number(e6) / 10_000);
const compact = (raw: bigint, decimals: number) => formatBaseUnits(raw, decimals, { minDp: 0, maxDp: 0 });
const time = (tSec: number) => new Date(tSec * 1000).toISOString().slice(11, 19) + " UTC";

export function SurfaceRow({ w, modelled, nowMs, expanded, onToggle, onFigures }: { w: SurfaceWindow; modelled: boolean; nowMs: number; expanded: boolean; onToggle: () => void; onFigures: (id: string, f: RowFigures) => void }) {
  const m: EventMarket = w.market;
  const f = useRowFigures(m, modelled, nowMs);
  useEffect(() => onFigures(m.marketId, f), [m.marketId, f, onFigures]);
  const hydrating = f.book === null && !f.bookFailed;
  const fairC = centsE6(f.fairUpE6);
  const gap = fairC !== null && f.upAskBps !== null ? f.upAskBps / 100 - fairC : null;
  const name = `${m.asset} ${w.label}`;
  return (
    <>
      <TableRow expanded={expanded}>
        <TableExpandTriggerCell expanded={expanded} onToggle={onToggle} label={expanded ? SURFACE.collapse(name) : SURFACE.expand(name)} />
        <TableCell>
          <span className="flex flex-col">
            <span className="type-body-strong text-ink">{w.label}</span>
            <span className="type-caption text-ink-secondary">{m.asset}</span>
          </span>
        </TableCell>
        <TableCell align="end" className="numbers">
          <Countdown expirySec={m.expirySec} intervalSec={m.intervalSec} nowMs={nowMs} />
        </TableCell>
        <TableCell className="w-40 min-w-35">
          <Sparkline points={f.path} baselineE8={m.openingPriceRaw} format={usd2} formatTime={time} label={SURFACE.pathLabel(m.asset)} />
        </TableCell>
        <TableCell align="end" className="max-md:hidden">{m.openingPriceRaw !== null ? usd0(m.openingPriceRaw) : <span className="text-ink-secondary">{SURFACE.pendingPrint}</span>}</TableCell>
        <TableCell align="end">{hydrating ? SURFACE.hydrating : cents(f.upAskBps)}</TableCell>
        <TableCell align="end" className="max-md:hidden">{hydrating ? SURFACE.hydrating : cents(f.upBidBps)}</TableCell>
        <TableCell align="end">{!modelled ? <span className="text-ink-secondary">{SURFACE.noModel}</span> : fairC === null ? SURFACE.hydrating : `${fairC.toFixed(1)}¢`}</TableCell>
        <TableCell align="end" className="max-md:hidden">{gap === null ? SURFACE.none : `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)}¢`}</TableCell>
        <TableCell align="end" className="max-md:hidden">{hydrating ? SURFACE.hydrating : `${cents(f.spreadBps)} · ${compact(f.bidDepthRaw, m.decimals)} / ${compact(f.askDepthRaw, m.decimals)}`}</TableCell>
      </TableRow>
      <TableExpandableContent open={expanded} colSpan={COLS}>
        <div className="flex flex-col gap-3">
          <p className="type-caption text-ink-secondary">{SURFACE.detail.depth}</p>
          <div className="h-55"><HeroDepth market={m} /></div>
          <p className="type-caption text-ink">{fairC !== null ? SURFACE.detail.model(`${fairC.toFixed(1)}¢`) : modelled ? SURFACE.hydrating : SURFACE.detail.noModel}</p>
          <Link href={`/markets/${m.marketId}`} className="min-h-touch self-start py-2 type-body-strong text-ink underline decoration-accent decoration-2 underline-offset-4">{SURFACE.detail.open}</Link>
        </div>
      </TableExpandableContent>
    </>
  );
}

export { C as SURFACE_COLUMNS };
