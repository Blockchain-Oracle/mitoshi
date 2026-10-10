"use client";
// The season league in the account drawer (S13 step 11; D-195, RV-87). Re-implemented from Tradash's Bulk Aura view
// (no code taken: the bundle ships no licence): the points card tinted by league, Rank and Percentile, then "Earned
// from" with each category's share; empty, loading and error states; and how points work, said in full.
import type { Address } from "@cwf/core";
import { useQuery } from "@tanstack/react-query";
import { LEAGUE as L } from "@/features/league/copy";
import type { LeaguePayload } from "@/features/league/league.server";
import "@/styles/league.css";

const left = (sec: number) => {
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3_600);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((sec % 3_600) / 60)}m`;
};

export function LeagueView({ wallet }: { wallet: Address | null }) {
  const q = useQuery({
    queryKey: ["league", wallet],
    enabled: wallet !== null,
    refetchInterval: 60_000,
    queryFn: async (): Promise<LeaguePayload> => {
      const res = await fetch(`/api/league?wallet=${wallet}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`league ${res.status}`);
      return (await res.json()) as LeaguePayload;
    },
  });
  if (!wallet) return <p className="tm-field-hint">{L.signedOut}</p>;
  if (q.isPending) return <p role="status" className="tm-field-hint">{L.loading}</p>;
  if (q.isError || !q.data) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="tm-field-hint">{L.error}</p>
        <button type="button" className="tm-choice" onClick={() => void q.refetch()}>{L.retry}</button>
      </div>
    );
  }
  const d = q.data;
  const start = new Date(d.week.startSec * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const max = d.categories[0]?.points ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <section className="tm-league" data-tier={d.tier ?? undefined} aria-label={L.title}>
        <div className="flex items-center justify-between gap-2">
          <span className="tm-field-hint">{L.points}</span>
          {d.tier ? (
            <span className="inline-flex items-center gap-1.5 type-caption font-bold text-ink"><span aria-hidden className="tm-league-dot" />{L.league(L.tier[d.tier])}</span>
          ) : null}
        </div>
        <p className="tm-league-points">{d.points.toLocaleString("en-US")}</p>
        <div className="tm-league-tiles">
          <div className="tm-league-tile"><p className="tm-field-hint">{L.rank}</p><p className="type-body-strong tabular-nums text-ink">{d.rank === null ? L.unranked : L.rankOf(d.rank, d.of)}</p></div>
          <div className="tm-league-tile"><p className="tm-field-hint">{L.percentile}</p><p className="type-body-strong tabular-nums text-ink">{d.topPercent === null ? "—" : L.top(d.topPercent)}</p></div>
        </div>
        <p className="mt-3 tm-field-hint">{L.week(start, left(Math.max(0, d.week.endSec - Math.floor(Date.now() / 1000))))}</p>
      </section>
      {d.categories.length === 0 ? (
        <p className="tm-field-hint">{L.empty}</p>
      ) : (
        <section aria-label={L.earnedFrom} className="flex flex-col gap-3">
          <h3 className="type-body-strong text-ink">{L.earnedFrom}</h3>
          <ul className="flex flex-col gap-3">
            {d.categories.map((c) => (
              <li key={c.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between type-body text-ink"><span>{L.category[c.key]}</span><span className="tabular-nums">{c.points.toLocaleString("en-US")}</span></div>
                <div className="tm-league-bar" aria-hidden><span style={{ width: `${max ? Math.round((c.points / max) * 100) : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <details className="rounded-lg border border-hairline p-3">
        <summary className="min-h-touch cursor-pointer content-center type-body-strong text-ink">{L.how}</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 type-caption text-ink-secondary">{L.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="mt-2 type-caption text-ink-secondary">{L.rulesNote}</p>
      </details>
    </div>
  );
}
