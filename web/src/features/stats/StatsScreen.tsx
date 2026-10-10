// `/stats` (S5, L-15) — Masayume 68f7a09 `features/stats/StatsPage.tsx`'s order (hero, Growth, Adoption, Live
// activity), server-rendered in the site group: the hero answers "can they get users?" in five seconds with the 21st
// 7870 card (`components/ui/stats-card.tsx`), then the curve, the venue's own counts and the latest calls, each with its
// receipt. Every figure is `readStats()`; when the index can't be read the page shows no number.
import { ArrowUpRight } from "lucide-react";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { addressUrl, formatBaseUnits, txUrl, USD_DECIMALS, type Network } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { StatsCard } from "@/components/ui/stats-card";
import { webEnv } from "@/lib/env";
import { STATS } from "./copy";
import { readStats } from "./data";
import { GrowthCurve } from "./GrowthCurve";

const DAY_MS = 86_400_000;
const usd = (base: string) => `$${formatBaseUnits(BigInt(base), USD_DECIMALS, { maxDp: 2, minDp: 2 })}`;
const count = (n: number) => n.toLocaleString("en-US");
const dayLabel = (day: number) => new Date(day * DAY_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const when = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} ${d.toISOString().slice(11, 16)}`;
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function SectionHead({ index, title, tag }: { index: string; title: string; tag: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-3">
      <span className="type-label-micro text-ink-secondary tabular-nums">{index}</span>
      <h2 className="type-title text-ink">{title}</h2>
      <span className="type-caption text-ink-secondary">{tag}</span>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-5">
      <span className="type-label-micro text-ink-secondary">{label}</span>
      <span className="type-title text-ink tabular-nums">{value}</span>
      <span className="type-caption text-ink-secondary">{sub}</span>
    </div>
  );
}

export async function StatsScreen() {
  await connection();
  const s = await readStats();
  if (!s) return <p className="rounded-lg border border-hairline bg-surface-1 p-4 type-body text-ink-secondary">{STATS.unreachable}</p>;
  const network: Network = webEnv.markets.network;
  let running = 0;
  const curve = s.days.map((d) => ({ label: dayLabel(d.day), cumulative: (running += d.newWallets) }));
  const bars = s.days.slice(-14);
  const C = STATS.card;
  const V = STATS.venue;

  return (
    <div className="flex flex-col gap-14">
      <section className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <div className="flex flex-col gap-5">
          <p className="flex items-center gap-2 type-label-micro text-ink-secondary">
            <span aria-hidden className="inline-block size-2 rounded-full bg-up" />
            {STATS.hero.eyebrow}
          </p>
          <h1 className="type-display text-ink">
            {STATS.hero.titleLead} <span className="text-accent">{STATS.hero.titleAccent}</span>.
          </h1>
          <p className="max-w-xl type-body text-ink-secondary">{STATS.hero.lede}</p>
        </div>
        <StatsCard
          title={C.title}
          timeFrame={C.timeFrame}
          headline={{ value: count(s.wallets), caption: C.active(s.wallets24h) }}
          subStats={[
            { value: count(s.calls), label: C.calls.label, sub: C.calls.sub },
            { value: usd(s.tradedBase), label: C.traded.label, sub: C.traded.sub },
          ]}
          band={{ value: usd(s.paidBase), label: C.paid.label, sub: C.paid.sub }}
          bars={{
            title: C.bars,
            counts: bars.map((d) => d.calls),
            label: C.barsLabel(bars[0] ? dayLabel(bars[0].day) : "—"),
            aria: C.barsAria(bars.map((d) => `${dayLabel(d.day)} ${d.calls}`).join(", ")),
          }}
        />
      </section>

      <section className="flex flex-col gap-5" aria-label={STATS.sections.growth.title}>
        <SectionHead {...STATS.sections.growth} />
        <div className="rounded-lg border border-hairline bg-surface-1 p-5">
          <GrowthCurve points={curve} />
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-label={STATS.sections.venue.title}>
        <SectionHead {...STATS.sections.venue} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label={V.opened.label} value={count(s.windowsOpened)} sub={V.opened.sub(s.windowsOpen)} />
          <Tile label={V.settled.label} value={count(s.windowsResolved)} sub={V.settled.sub(s.windowsVoided)} />
          <Tile label={V.prints.label} value={count(s.prints)} sub={V.prints.sub} />
          <Tile label={V.house.label} value={count(s.houseFills)} sub={V.house.sub} />
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-label={STATS.sections.activity.title}>
        <SectionHead {...STATS.sections.activity} />
        {s.recent.length === 0 ? (
          <p className="type-body text-ink-secondary">{STATS.activity.empty}</p>
        ) : (
          <ol className="flex flex-col overflow-hidden rounded-lg border border-hairline">
            {s.recent.map((c) => (
              <li key={`${c.txHash}-${c.kind}-${c.wallet ?? ""}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-3 first:border-t-0">
                <span className={`inline-block size-2 shrink-0 rounded-full ${c.kind <= 1 ? "bg-up" : "bg-down"}`} aria-hidden />
                <span className="min-w-36 type-body-strong text-ink">
                  {STATS.activity.kind[c.kind] ?? "Call"} · {c.symbol} {formatCadence(c.cadenceSec)}
                </span>
                {c.wallet ? (
                  <a href={addressUrl(c.wallet as `0x${string}`, network)} target="_blank" rel="noopener noreferrer" className="font-mono type-caption text-ink-secondary underline-offset-4 hover:underline">
                    {short(c.wallet)}
                  </a>
                ) : (
                  <span className="type-caption text-ink-secondary">{STATS.activity.product}</span>
                )}
                <span className="ml-auto type-body text-ink tabular-nums">{usd(c.cashBase)}</span>
                <span className="w-28 text-right type-caption text-ink-secondary tabular-nums">{when(c.tsSec)}</span>
                <a href={txUrl(c.txHash as `0x${string}`, network)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-touch items-center gap-1 type-caption text-ink underline-offset-4 hover:underline">
                  {STATS.activity.receipt} <ArrowUpRight aria-hidden className="size-3.5" />
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="flex max-w-3xl flex-col gap-3 type-caption text-ink-secondary">
        <p>{STATS.attribution(s.unattributed)}</p>
        <p>{STATS.testnet}</p>
        <p>
          {STATS.foot} {STATS.computed(new Date(s.computedAtMs).toISOString().replace("T", " ").slice(0, 16))}
        </p>
      </footer>
    </div>
  );
}
