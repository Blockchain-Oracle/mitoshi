// /u/[address]'s outline (R6 T18 + money S20, D-230): the settled record's own frames (styles/news.css + features/profile/
// profile.css) — the eyebrow, the ident row (avatar, mono address, followers | the action pair), the Japanese sub line,
// the one stat row, the realised-P&L card, then the sections with their rows. Never one grey bar.
import { RowBones, Skeleton, T } from "./bones";

export const profile = () => (
  <div className="news-inner">
    <div className="news-live"><T className="news-live-label">Trader profile</T></div>
    <div className="prf-bar" data-bone="bar">
      <div className="prf-ident">
        <Skeleton className="prf-avatar size-10 rounded-full md:size-11" />
        <div className="news-title prf-title"><T>0x0000…0000</T></div>
        <T className="prf-followers">0 followers</T>
      </div>
      <div className="prf-actions">
        <Skeleton className="h-12 w-28 rounded-full" />
        <Skeleton className="h-12 w-40 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
      </div>
    </div>
    <div className="page-title-jp"><T>取引者の記録。</T></div>
    <dl className="prf-stats">
      {["P&L", "ROI", "Win rate", "Rounds", "Rank"].map((label, i) => (
        <div key={label} className={i === 0 ? "prf-stat prf-stat-lead" : "prf-stat"}>
          <dt><T>{label}</T></dt>
          <dd className="big"><T>{i === 0 ? "+$0.00" : "00%"}</T></dd>
        </div>
      ))}
    </dl>
    <div className="prf-curve" data-bone="curve">
      <Skeleton className="h-3 w-24 rounded-md" />
      <Skeleton className="h-55 w-full rounded-lg" />
    </div>
    {["01 · Open calls", "02 · Settled"].map((title) => (
      <section key={title} className="prf-section" data-bone="section">
        <header className="border-b border-hairline pb-2"><T className="type-title">{title}</T></header>
        <div className="flex flex-col">
          <RowBones />
          <RowBones />
        </div>
      </section>
    ))}
  </div>
);
