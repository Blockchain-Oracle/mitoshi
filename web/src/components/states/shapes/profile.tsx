// /u/[address]'s outline (R6 T18, D-230): the settled record's own frames (styles/news.css + features/profile/
// profile.css) — the eyebrow, the identity row (avatar + mono address), the Japanese sub line, the figures row with the
// actions, then the sections with their rows. Before R6 it waited as one grey bar ("plate").
import { RowBones, Skeleton, T } from "./bones";

export const profile = () => (
  <div className="news-inner">
    <div className="news-live"><T className="news-live-label">Trader profile</T></div>
    <div className="prf-ident">
      <Skeleton className="prf-avatar size-8 rounded-full md:size-11" />
      <div className="news-title prf-title"><T>0x0000…0000</T></div>
    </div>
    <div className="page-title-jp"><T>取引者の記録。</T></div>
    <div className="prf-bar" data-bone="bar">
      <dl className="prf-stats">
        {[["P&L", "$0.00"], ["Rank", "—"], ["Tier", "Novice"], ["Followers", "0"]].map(([label, value]) => (
          <div key={label} className="prf-stat">
            <dt><T>{label}</T></dt>
            <dd className="big"><T>{value}</T></dd>
          </div>
        ))}
      </dl>
      <div className="prf-actions page-action">
        <Skeleton className="h-12 w-23 rounded-full" />
        <Skeleton className="h-12 w-40 rounded-full" />
        <Skeleton className="h-9 w-36 rounded-full" />
        <Skeleton className="h-9 w-26 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
      </div>
    </div>
    {["01", "02"].map((n) => (
      <section key={n} className="prf-section" data-bone="section">
        <header className="border-b border-hairline pb-2"><T className="type-title">{n} · Open calls</T></header>
        <div className="flex flex-col">
          <RowBones />
          <RowBones />
        </div>
      </section>
    ))}
  </div>
);
