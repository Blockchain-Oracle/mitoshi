// /markets' outlines (D-226; R6 T08, D-230). `markets-hero` is the hero card itself, box for box: it draws the settled
// card's own classes (`.hero-chart` and its head, canvas, UP/DOWN and foot — styles/markets-hero*.css, loaded by the
// route) with text bones in the head's own type, a chart box with a shimmering grid and the dashed opening line, and the
// UP/DOWN pair. It is NOT drawn inside `.mh-hero-empty` (whose centring flex collapsed the old chart bone to 0 px).
// `markets-rail` is the ticket rail from `lg`: tabs, sides, amount, chips, readout, route toggle, CTA, foot.
import { Skeleton, T } from "./bones";

/** The old generic hero (question + chart beside a ticket); kept for callers outside /markets. */
export const hero = () => (
  <div className="skel-hero">
    <div className="skel-card">
      <div className="flex items-center gap-2">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-3 w-24 rounded-md" />
        <Skeleton className="ml-auto h-8 w-16 rounded-md" />
      </div>
      <Skeleton className="h-8 w-3/4 rounded-md" />
      <Skeleton className="h-64 w-full rounded-md" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
      </div>
    </div>
    <div className="skel-card max-lg:hidden">
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-14 w-full rounded-md" />
      <Skeleton className="h-12 w-1/2 self-center rounded-md" />
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-(--ticket-cta-height) w-full rounded-md" />
    </div>
  </div>
);

export const marketsHero = () => (
  <div className="hero-chart skel-hero-card">
    <div className="hero-chart-head">
      <div className="mh-head-main">
        <div className="mh-asset-row">
          <Skeleton className="mh-asset-badge size-7 rounded-full" />
          <T className="mh-asset-label">BTC</T>
          <div className="mh-cadence-tabs skel-chips">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-7 w-15 rounded-full" />)}
          </div>
        </div>
        <div className="mh-question"><T>BTC · USD</T></div>
        <div className="mh-distance"><T>Opening print pending.</T></div>
        <span className="src-line pair-meta"><T>Settles on a signed oracle</T></span>
      </div>
      <div className="mh-settles">
        <span className="mh-settles-label"><T>Settles in</T></span>
        <span className="mh-settles-value numbers"><T>0:00</T></span>
      </div>
    </div>
    <div className="hero-chart-canvas">
      <div className="skel-chart-grid" data-bone="chart" aria-hidden>
        <span /><span /><span /><span />
        <i className="skel-chart-open" />
      </div>
    </div>
    <div className="hero-yesno">
      <Skeleton className="hyn hyn-yes" bone="up" />
      <Skeleton className="hyn hyn-no" bone="down" />
    </div>
    <div className="hero-chart-foot">
      <div className="mh-foot-actions">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="mh-room size-11 rounded-full" />)}
      </div>
      <Skeleton className="ramp h-4 w-17 rounded-md" />
    </div>
  </div>
);

/** The ticket rail's blocks (from `lg`), drawn inside the settled rail's own frame (`RailFrame`), bones inside. */
export const marketsRail = () => (
  <>
    <div className="tk-modes">
      <Skeleton className="h-11 flex-1 rounded-md" />
      <Skeleton className="h-11 flex-1 rounded-md" />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Skeleton className="h-(--ticket-cta-height) rounded-md" />
      <Skeleton className="h-(--ticket-cta-height) rounded-md" />
    </div>
    <div className="tk-amount">
      <div className="tk-amount-head"><T className="tk-amount-label">Bet amount</T></div>
      <div className="tk-amount-field"><T className="tk-amount-input">5</T></div>
      <div className="tk-amount-row">
        <div className="tk-adds">{[0, 1, 2].map((i) => <Skeleton key={i} className="tk-add h-11 w-10 rounded-md" />)}</div>
        <div className="tk-levs">{[0, 1, 2].map((i) => <Skeleton key={i} className="tk-lev h-11 w-10 rounded-md" />)}</div>
      </div>
    </div>
    <div className="tk-readout">
      {[0, 1, 2].map((i) => (
        <div key={i} className="tk-readout-cell">
          <T className="tk-readout-label">Current cost</T>
          <T className="tk-readout-value">$0.00</T>
        </div>
      ))}
    </div>
    <div className="tk-caption"><T>Live odds</T></div>
    <div className="tk-pp-row"><Skeleton className="tk-pp h-12.5 w-full rounded-lg" /></div>
    <div className="tk-cta-dock">
      <div className="txcta">
        <Skeleton className="h-(--ticket-cta-height) w-full rounded-full" bone="cta" />
        <div className="txcta-caption" />
      </div>
      <p className="tk-foot"><T>Settles on its own, right on the price.</T></p>
    </div>
  </>
);
