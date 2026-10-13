// /stats' outline (R6 T18, D-230): the settled page's own frames (styles/stats.css) — the head beside the counter plate
// (its own column from `lg`), "01 · Growth" over the curve card, "02 · Adoption" 2-up — with text bones in each slot's
// own type, so the page lands where its outline stood.
import { SectionHeadBones, Skeleton, T } from "./bones";

export const stats = () => (
  <div className="stats-page">
    <section className="stats-hero">
      <div>
        <p className="stats-eyebrow"><T>Live · on chain</T></p>
        <div className="mt-4 type-display">
          <T>Proof of</T>
          <br />
          <T>demand.</T>
        </div>
        <p className="stats-lede"><T>Wallets that took a side, read from the engine on Tempo.</T></p>
      </div>
      <div className="stats-headline" data-bone="plate">
        <div className="stats-headline-eyebrow"><T>Wallets that made a call</T></div>
        <div className="stats-headline-value"><T>000</T></div>
        <div className="stats-headline-caption"><T>00 active in 24 h</T></div>
        <div className="stats-headline-foot">
          <div>
            <div className="stats-headline-foot-label"><T>Calls</T></div>
            <div className="stats-headline-foot-value"><T>000</T></div>
          </div>
          <Skeleton className="h-8 max-w-48 flex-1 rounded-sm" />
        </div>
      </div>
    </section>
    <section className="stats-section">
      <SectionHeadBones desc />
      <div className="stats-curve-card" data-bone="chart">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between type-label-micro"><T>Wallets</T><T>000</T></div>
          <Skeleton className="h-50 w-full rounded-md" />
          <div className="flex justify-between type-caption"><T>30 Sept</T><T>13 Oct</T></div>
        </div>
      </div>
    </section>
    <section className="stats-section">
      <SectionHeadBones />
      <div className="stats-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat-card">
            <div className="stat-label"><T>Calls</T></div>
            <div className="stat-value"><T>000</T></div>
            {i > 1 ? <div className="stat-sub"><T>all time</T></div> : null}
          </div>
        ))}
      </div>
    </section>
  </div>
);
