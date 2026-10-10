"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/history/{ReputationPanel,BadgeGrid,useCsvDownload}.ts(x) — the
// reputation tier with the record it rests on and the distance to the next, the five badges (each saying Unlocked or
// Locked in words, numbered), and the settled rounds as a CSV built in the browser at full precision (L-49). Placed on
// Trader Edge, the one personal-history page (ux-audit fix 14). Tiers and thresholds are Yosuku's, inherited; no tier
// pays a bonus or cuts a fee, so none is shown. The LP badge waits on Earn's page (S8): the vault has no way in yet.
import { computeBadges, reputationOf, roundsToCsv, type BadgeId, type ReputationTier, type TraderEdge, type WalletHistory } from "@cwf/core";
import { BadgeCheck, ChartNoAxesCombined, Crown, Download, Droplets, Flame, Target, type LucideIcon } from "lucide-react";
import { notify } from "@/lib/toast";

const ICONS: Record<BadgeId, LucideIcon> = { first_trade: Target, winning_streak: Flame, lp_provider: Droplets, whale: ChartNoAxesCombined, oracle: Crown };

const W = {
  title: "Reputation",
  tier: "Tier",
  record: (bets: number, wins: number) => `${wins} of ${bets} decided Windows won`,
  next: (tier: string) => `Next: ${tier}`,
  top: "Top tier",
  progress: (pct: number) => `${pct}% toward the next tier`,
  tiers: { Novice: "Novice", Trader: "Trader", Whale: "Whale", Oracle: "Oracle" } satisfies Record<ReputationTier, string>,
  rule: "Tiers are earned on decided Windows and win rate: Trader at 5 and 45 %, Whale at 15 and 55 %, Oracle at 30 and 65 %.",
  badges: "Badges",
  unlockedCount: (n: number, total: number) => `${n} of ${total} unlocked`,
  nextBadge: (name: string) => `Next: ${name}`,
  unlocked: "Unlocked",
  locked: "Locked",
  pendingEarn: "Opens with Earn",
  names: {
    first_trade: { name: "First Trade", description: "Opened your first position." },
    winning_streak: { name: "Hot Streak", description: "3 winning Windows in a row." },
    lp_provider: { name: "LP Provider", description: "Supplied the maker vault." },
    whale: { name: "Whale", description: "Staked $1,000 in all." },
    oracle: { name: "Oracle", description: "70 %+ won over 10+ decided Windows." },
  } satisfies Record<BadgeId, { name: string; description: string }>,
  csv: "Download CSV",
  csvNote: "Every settled Window on this page, one row each, at full precision.",
  csvName: (address: string) => `mitoshi-history-${address.slice(0, 8)}.csv`,
  csvFailed: "Couldn't build the file. Try again.",
} as const;

function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      <span className="block h-full rounded-full bg-accent-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function RecordBadges({ history, report, address }: { history: WalletHistory; report: TraderEdge; address: string }) {
  const decided = report.wins + report.losses;
  const reputation = reputationOf(decided, report.wins, report.currentWinStreak);
  // `lpSharesRaw: null` → the LP badge stays locked and names what it waits on (Masayume's own rule for no vault).
  const badges = computeBadges({ fillCount: history.fillCount, currentWinStreak: report.currentWinStreak, stakeBase: report.stakeBase, decidedRounds: decided, winRate: decided ? report.wins / decided : 0, decimals: history.decimals, lpSharesRaw: null });
  const earned = badges.filter((b) => b.earned).length;
  const next = badges.find((b) => !b.earned && b.pending === null);
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([roundsToCsv(history.rounds)], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = W.csvName(address);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch {
      notify.warning(W.csvFailed);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="edge-reputation">
      <h2 id="edge-reputation" className="type-title text-ink">{W.title}</h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-1 p-5">
          <div className="flex flex-col gap-1">
            <span className="type-label-micro text-ink-secondary">{W.tier}</span>
            <span className="type-display text-ink">{W.tiers[reputation.tier]}</span>
            <span className="type-caption text-ink-secondary">{W.record(reputation.bets, reputation.wins)}</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-caption text-ink-secondary">{reputation.nextTier ? W.next(W.tiers[reputation.nextTier]) : W.top}</span>
            <Bar pct={reputation.progressToNext} label={W.progress(reputation.progressToNext)} />
            <span className="type-caption text-ink-secondary">{W.rule}</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <span className="flex flex-col">
              <span className="type-label-micro text-ink-secondary">{W.badges}</span>
              <span className="type-title text-ink tabular-nums">{earned}<span className="text-ink-secondary">/{badges.length}</span></span>
            </span>
            <span className="type-caption text-ink-secondary">{next ? W.nextBadge(W.names[next.id].name) : W.unlockedCount(earned, badges.length)}</span>
          </div>
          <Bar pct={Math.round((earned / badges.length) * 100)} label={W.unlockedCount(earned, badges.length)} />
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {badges.map((b, i) => {
              const Icon = ICONS[b.id] ?? BadgeCheck;
              const words = W.names[b.id];
              return (
                <li key={b.id} className={`flex flex-col gap-2 rounded-md border p-3 ${b.earned ? "border-accent/40 bg-accent/10" : "border-hairline bg-surface-2"}`}>
                  <span className="flex items-center justify-between type-label-micro text-ink-secondary">
                    <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span className={b.earned ? "text-accent" : ""}>{b.earned ? W.unlocked : b.pending === "earn" ? W.pendingEarn : W.locked}</span>
                  </span>
                  <Icon aria-hidden strokeWidth={1.9} className={`size-6 ${b.earned ? "text-accent" : "text-ink-secondary"}`} />
                  <span className="type-body-strong text-ink">{words.name}</span>
                  <span className="type-caption text-ink-secondary">{words.description}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={download} className="inline-flex min-h-touch items-center gap-2 rounded-full border border-hairline px-5 type-body-strong text-ink hover:bg-surface-2">
          <Download aria-hidden className="size-4" /> {W.csv}
        </button>
        <span className="type-caption text-ink-secondary">{W.csvNote}</span>
      </div>
    </section>
  );
}
