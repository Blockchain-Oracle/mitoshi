"use client";
/**
 * `/surface` (S10e; R4-11, D-227) — Ported from Owarine 90a91d71:web/src/features/surface/SurfaceScreen.tsx: the title and
 * one line, the asset and Window chips choosing one focal Window — with the accent "Trade" on its row, in the first fold
 * at 375 — then 01 the book (BookReadout, plus Mitoshi's model tile), 02 depth (the hero's own HeroDepth), 03 slippage,
 * 04 the term structure (the curve and every live Window as rows, the model as a column), and one mono basis line.
 * No section shows a figure the chain or the signed feed did not give: hydrating is "…", an empty side "—".
 */
import { bookStructure, formatCadence } from "@cwf/core";
import dynamic from "next/dynamic";
import Link from "next/link";
import { pillButtonVariants } from "@/components/kit/PillButton";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { ReadingBoundary } from "@/components/states";
import { useMarketSession } from "@/features/markets/session";
import { terminalHref } from "@/features/terminal/route";
import { useNowMs } from "@/lib/clock";
import { BookReadout } from "./BookReadout";
import { SURFACE } from "./copy";
import { SlippageLadder } from "./SlippageLadder";
import { SurfaceChips } from "./SurfaceChips";
import { TermStructure } from "./TermStructure";
import { useFocalFigures, useSurfaceSelection } from "./useSurface";
import "@/styles/surface.css";
import "@/components/kit/kit.css";

const HeroDepth = dynamic(() => import("../markets/hero/HeroDepth"), { ssr: false, loading: () => <div className="sf-box sf-box--chart" /> });

export function SurfaceScreen() {
  const nowMs = useNowMs();
  const sel = useSurfaceSelection();
  const focal = sel.focal;
  const modelled = focal ? sel.modelled(focal) : false;
  const fig = useFocalFigures(focal, modelled, nowMs);
  const structure = fig.book?.ok ? bookStructure(fig.book.value) : null;
  const session = useMarketSession();
  const empty = session && !session.open ? SURFACE.closed(session.label) : SURFACE.noLive;
  const S = SURFACE.sections;
  return (
    <div className="sf-page">
      <header className="sf-head">
        <h1 className="type-display text-ink">{SURFACE.title}</h1>
        <p className="type-body text-ink-secondary">{SURFACE.line}</p>
      </header>
      <ReadingBoundary reading={sel.reading} shape="plate" isEmpty={(set) => set.lanes.every((l) => l.markets.length === 0)} empty={{ why: empty }}>
        {() => (
          <>
            <div className="sf-focal">
              <SurfaceChips assets={sel.assets} asset={sel.asset} onAsset={sel.setAsset} windows={sel.windows} focalId={focal?.marketId ?? null} onFocal={sel.setFocal} nowMs={nowMs} />
              {focal ? <Link href={terminalHref(focal.asset, focal.marketId)} className={pillButtonVariants({ tone: "accent", size: "md" })}>{SURFACE.trade}</Link> : null}
            </div>
            {focal ? (
              <div className="sf-sections">
                <section>
                  <SectionHeader index={S.book.number} title={S.book.title} aside={<span className="sf-meta">{`${focal.asset} · ${formatCadence(focal.intervalSec)}`}</span>} />
                  <BookReadout market={focal} structure={structure} hydrating={fig.book === null} spotE8={fig.spotE8} fairUpE6={fig.fairUpE6} modelled={modelled} nowMs={nowMs} />
                </section>
                <section>
                  <SectionHeader index={S.depth.number} title={S.depth.title} desc={S.depth.desc} aside={structure ? <span className="sf-meta">{structure.levels}</span> : undefined} />
                  <div className="sf-box sf-box--chart"><HeroDepth market={focal} /></div>
                </section>
                <section>
                  <SectionHeader index={S.slippage.number} title={S.slippage.title} desc={S.slippage.desc} />
                  <SlippageLadder depth={fig.book?.ok ? fig.book.value : null} lotRaw={fig.lotRaw} />
                </section>
                <section>
                  <SectionHeader index={S.term.number} title={S.term.title} desc={S.term.desc(focal.asset)} />
                  <TermStructure windows={sel.windows} modelled={sel.modelled} spotE8={fig.spotE8} nowMs={nowMs} focalId={focal.marketId} onPick={sel.setFocal} />
                </section>
                <p className="sf-basis">{SURFACE.basis}</p>
              </div>
            ) : null}
          </>
        )}
      </ReadingBoundary>
    </div>
  );
}
