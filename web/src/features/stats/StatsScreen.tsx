// `/stats` (S5, L-15) — Ported from Owarine 90a91d71:web/src/features/stats/StatsPage.tsx (`StatsView`) and
// styles/stats.css (R4-10, D-227): the hero answers "can they get users?" in five seconds — the lede beside the headline
// card (wallets at 88 px, who was active in 24 h, calls and the 14-day strip under its foot) — then 01 Growth, 02
// Adoption (2×2), 03 Live activity (each row opens its receipt), 04 Venue, and one footnote. Every figure is
// `readStats()`, read on the server; when the index can't be read the page shows no number.
import { addressUrl, formatBaseUnits, txUrl, USD_DECIMALS, type Network } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import Link from "next/link";
import { connection } from "next/server";
import { ExternalLink } from "@/components/shell/ExternalLink";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { docsUrl } from "@/lib/docs-url";
import { webEnv } from "@/lib/env";
import { STATS } from "./copy";
import { readStats } from "./data";
import { GrowthCurve } from "./GrowthCurve";
import "@/components/kit/kit.css";

const DAY_MS = 86_400_000;
const usd = (base: string) => `$${formatBaseUnits(BigInt(base), USD_DECIMALS, { maxDp: 2, minDp: 2 })}`;
const count = (n: number) => n.toLocaleString("en-US");
const dayLabel = (day: number) => new Date(day * DAY_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const ago = (sec: number, nowMs: number) => {
  const m = Math.max(0, Math.floor((nowMs - sec * 1000) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** A bar's height as one of eight steps of the strip's highest day (a token class, no inline px). */
const STEP = ["h-1/8", "h-2/8", "h-3/8", "h-4/8", "h-5/8", "h-6/8", "h-7/8", "h-full"] as const;

function Stat({ label, value, sub, accent = false, href }: { label: string; value: string; sub?: string; accent?: boolean; href?: string }) {
  const body = (
    <>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </>
  );
  const cls = accent ? "stat-card accent" : "stat-card";
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export async function StatsScreen() {
  await connection();
  const s = await readStats();
  if (!s) return <p className="stats-unreachable">{STATS.unreachable}</p>;
  const network: Network = webEnv.markets.network;
  let running = 0;
  const curve = s.days.map((d) => ({ label: dayLabel(d.day), cumulative: (running += d.newWallets) }));
  const bars = s.days.slice(-14);
  const top = Math.max(1, ...bars.map((d) => d.calls));
  const nowMs = s.computedAtMs;
  const H = STATS.hero;
  const C = STATS.card;
  const V = STATS.venue;
  const S = STATS.sections;

  return (
    <div className="stats-page">
      <section className="stats-hero">
        <div>
          <p className="stats-eyebrow">
            <span className="stats-eyebrow-dash" aria-hidden />
            <span className="stats-live-dot" aria-hidden />
            {H.eyebrow}
          </p>
          <h1 className="mt-4 type-display text-ink">
            {H.titleLead}
            <br />
            <span className="text-accent">{H.titleAccent}</span>.
          </h1>
          <p className="stats-lede">{H.lede}</p>
        </div>
        <div className="stats-headline">
          <div className="stats-headline-eyebrow">
            <span className="stats-live-dot" aria-hidden />
            {H.headline}
          </div>
          <div className="stats-headline-value">{count(s.wallets)}</div>
          <div className="stats-headline-caption">{H.caption(s.wallets24h)}</div>
          <div className="stats-headline-foot">
            <div>
              <div className="stats-headline-foot-label">{H.foot}</div>
              <div className="stats-headline-foot-value">{count(s.calls)}</div>
            </div>
            {bars.length > 0 ? (
              <div className="flex min-w-0 flex-1 flex-col items-end">
                <div className="stats-bars" role="img" aria-label={STATS.barsAria(bars.map((d) => `${dayLabel(d.day)} ${d.calls}`).join(", "))}>
                  {bars.map((d) => (
                    <span key={d.day} data-zero={d.calls === 0} className={`stats-bar ${d.calls === 0 ? "h-1/8" : STEP[Math.min(7, Math.ceil((d.calls / top) * 8) - 1)]}`} />
                  ))}
                </div>
                <div className="stats-bars-label">{STATS.bars(dayLabel(bars[0]!.day))}</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="stats-section" aria-label={S.growth.title}>
        <SectionHeader index={S.growth.index} title={S.growth.title} desc={S.growth.desc} />
        <div className="stats-curve-card">
          <GrowthCurve points={curve} />
        </div>
      </section>

      <section className="stats-section" aria-label={S.adoption.title}>
        <SectionHeader index={S.adoption.index} title={S.adoption.title} />
        <div className="stats-grid">
          <Stat label={C.wallets.label} value={count(s.wallets)} accent />
          <Stat label={C.calls.label} value={count(s.calls)} />
          <Stat label={C.traded.label} value={usd(s.tradedBase)} sub={C.traded.sub} />
          <Stat label={C.paid.label} value={usd(s.paidBase)} sub={C.paid.sub} />
        </div>
      </section>

      <section className="stats-section" aria-label={S.activity.title}>
        <SectionHeader index={S.activity.index} title={S.activity.title} desc={S.activity.desc} />
        <div className="stats-activity">
          {s.recent.length === 0 ? (
            <p className="stats-activity-empty">{STATS.activity.empty}</p>
          ) : (
            s.recent.map((c) => (
              <div key={`${c.txHash}-${c.kind}-${c.wallet ?? ""}`} className="stats-row">
                <span className="stats-dot" data-side={c.kind <= 1 ? "up" : "down"} aria-hidden />
                <a href={txUrl(c.txHash as `0x${string}`, network)} target="_blank" rel="noopener noreferrer" className="stats-row-kind">
                  {STATS.activity.kind[c.kind] ?? "Call"} · {c.symbol} {formatCadence(c.cadenceSec)}
                </a>
                {c.wallet ? (
                  <a href={addressUrl(c.wallet as `0x${string}`, network)} target="_blank" rel="noopener noreferrer" className="stats-row-wallet">{short(c.wallet)}</a>
                ) : (
                  <span className="stats-row-wallet">{STATS.activity.product}</span>
                )}
                <span className="stats-row-spacer" />
                <span className="stats-row-amount">{usd(c.cashBase)}</span>
                <span className="stats-row-time">{ago(c.tsSec, nowMs)}</span>
                <span className="stats-row-arrow" aria-hidden>↗</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="stats-section" aria-label={S.venue.title}>
        <SectionHeader index={S.venue.index} title={S.venue.title} />
        <div className="stats-grid">
          <Stat label={V.opened.label} value={count(s.windowsOpened)} sub={V.opened.sub(s.windowsOpen)} />
          <Stat label={V.settled.label} value={count(s.windowsResolved)} sub={V.settled.sub(s.windowsVoided)} />
          <Stat label={V.prints.label} value={count(s.prints)} sub={V.prints.sub} href="/proof" />
          <Stat label={V.house.label} value={count(s.houseFills)} sub={V.house.sub} />
        </div>
      </section>

      <p className="stats-foot">
        {STATS.foot(s.unattributed, new Date(s.computedAtMs).toISOString().replace("T", " ").slice(0, 16))}{" "}
        <ExternalLink href={docsUrl("explore/record")}>{STATS.how}</ExternalLink>
      </p>
    </div>
  );
}
