// Ported from Owarine 90a91d71:web/src/features/markets/history/BadgeGrid.tsx (R4-4, D-227; over Masayume 68f7a09's) —
// the rank cell (N/5 and its bar), then one numbered card per badge, each saying Unlocked or Locked in words; a badge
// whose source isn't connected says what it waits on. Under 640 px the cards (144 px each, ~720 px stacked) give way to
// one row of five 44 px seals with their names under them — the same badges, earned in the accent, locked muted.
import type { Badge, BadgeId } from "@cwf/core";
import { BadgeCheck, ChartNoAxesCombined, Crown, Droplets, Flame, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECORD } from "../copy";

const ICONS: Record<BadgeId, LucideIcon> = { first_trade: Target, winning_streak: Flame, lp_provider: Droplets, whale: ChartNoAxesCombined, oracle: Crown };

export function BadgeGrid({ badges }: { badges: readonly Badge[] }) {
  const earned = badges.filter((b) => b.earned).length;
  const total = badges.length;
  const progress = total > 0 ? Math.round((earned / total) * 100) : 0;
  const next = badges.find((b) => !b.earned && b.pending === null);
  const words = (id: BadgeId) => RECORD.names[id] ?? { name: id, description: "" };
  const state = (b: Badge) => (b.earned ? RECORD.unlocked : b.pending === "earn" ? RECORD.pendingEarn : RECORD.locked);
  return (
    <div className="badge-display">
      <div className="badge-rank">
        <div>
          <div className="type-label-micro text-ink-muted">{RECORD.badges}</div>
          <div className="badge-rank-figure">
            {earned}
            <span className="badge-rank-slash">/</span>
            {total}
          </div>
          <div className="type-caption text-ink-secondary">{next ? RECORD.nextBadge(words(next.id).name) : RECORD.unlockedCount(earned, total)}</div>
        </div>
        <div className="badge-rank-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={RECORD.unlockedCount(earned, total)}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <ul className="badge-seals" aria-label={RECORD.badges}>
        {badges.map((b) => {
          const Icon = ICONS[b.id] ?? BadgeCheck;
          return (
            <li key={b.id} className={cn("badge-seal", b.earned ? "is-earned" : "is-locked")} title={`${words(b.id).description} · ${state(b)}`}>
              <span className="badge-seal-icon" aria-hidden><Icon strokeWidth={1.9} /></span>
              <span className="badge-seal-name">{words(b.id).name}</span>
              <span className="sr-only">{state(b)}</span>
            </li>
          );
        })}
      </ul>
      <ul className="badge-grid">
        {badges.map((b, i) => {
          const Icon = ICONS[b.id] ?? BadgeCheck;
          return (
            <li key={b.id} className={cn("badge-card", b.earned ? "is-earned" : "is-locked")} title={words(b.id).description}>
              <div className="badge-card-head type-label-micro">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span>{state(b)}</span>
              </div>
              <div className="badge-card-icon" aria-hidden><Icon strokeWidth={1.9} /></div>
              <div className="type-body-strong text-ink">{words(b.id).name}</div>
              <div className="type-caption text-ink-secondary">{words(b.id).description}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
