// /parlay's outline (R6 T18, D-230): the settled page's own frames (styles/parlay.css) — the game head, the cadence
// tabs with the streak pill, the Window rows (disc, name and cadence, line, UP/DOWN), and from the desk the slip card
// beside them. Before R6 it waited in the generic game shape.
import { Skeleton, T } from "./bones";

export const parlay = () => (
  <>
    <header className="gh">
      <div className="gh-title"><T>Parlay</T></div>
      <Skeleton className="ml-auto h-9 w-28 rounded-full" />
      <Skeleton className="size-9 rounded-full" />
    </header>
    <div className="pl-grid">
      <div className="pl-windows">
        <div className="pw">
          <div className="pw-head">
            <div className="flex gap-2">{[0, 1].map((i) => <Skeleton key={i} className="h-11 w-16 rounded-md" />)}</div>
            <Skeleton className="pw-streak h-9 w-40 rounded-full" />
          </div>
          <ul className="pw-list" data-bone="rows">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="pw-row">
                <Skeleton className="gw-disc pw-disc rounded-full" />
                <div className="pw-main">
                  <span className="pw-name"><T>AAPL 15m</T></span>
                  <span className="pw-meta"><T>Closes 15:20 · 4m 12s</T></span>
                </div>
                <div className="pw-sides">
                  <Skeleton className="pw-side min-h-touch rounded-md" />
                  <Skeleton className="pw-side min-h-touch rounded-md" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <aside className="pl-rail max-lg:hidden" data-bone="slip">
        <header className="ps-head"><T className="ps-head-title">Slip</T><T className="ps-count">0 / 3</T></header>
        <div className="ps">
          <T className="ps-empty">Pick 2–3 Windows</T>
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 flex-1 rounded-full" />)}</div>
          <Skeleton className="h-(--ticket-cta-height) w-full rounded-full" />
        </div>
      </aside>
    </div>
  </>
);
