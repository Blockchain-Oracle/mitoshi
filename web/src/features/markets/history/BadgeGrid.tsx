// The record's badges (R6 money, S20; D-230) — From 21st.dev 13023 trophyso/achievement-card, revamped onto the seals
// of the earlier grid (12996 trophyso/achievement-badge lineage, Owarine 90a91d71 BadgeGrid): a head with "1 of 5
// badges", the tier as a chip and what the next tier takes ("Next: Trader at 5 decided · 45% won" — the reputation card
// folded in), then one row per badge — earned in the accent ring, the next one with its progress bar and "2 of 3", the
// rest locked yet legible (secondary ink on surface-2, the icon at 60 %, AA in both themes). No rarity line, no badge
// images. Rows read as a phone list; two columns from 1024.
import { REPUTATION_TIERS, nextBadge, type Badge, type BadgeId, type ReputationData } from "@cwf/core";
import { BadgeCheck, ChartNoAxesCombined, Crown, Droplets, Flame, Target, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { RECORD } from "../copy";
import "@/styles/badges.css";

const ICONS: Record<BadgeId, LucideIcon> = { first_trade: Target, winning_streak: Flame, lp_provider: Droplets, whale: ChartNoAxesCombined, oracle: Crown };

function tierLine(r: ReputationData): string {
  if (!r.nextTier) return RECORD.top;
  const rule = REPUTATION_TIERS.find((t) => t.tier === r.nextTier);
  return rule ? RECORD.tierNext(RECORD.tiers[r.nextTier] ?? r.nextTier, rule.minBets, Math.round(rule.minWinRate * 100)) : RECORD.next(r.nextTier);
}

export function BadgeGrid({ badges, reputation }: { badges: readonly Badge[]; reputation?: ReputationData }) {
  const earned = badges.filter((b) => b.earned).length;
  const next = nextBadge(badges);
  const words = (id: BadgeId) => RECORD.names[id] ?? { name: id, description: "" };
  const stateOf = (b: Badge): "earned" | "next" | "locked" => (b.earned ? "earned" : next?.id === b.id ? "next" : "locked");
  const stateWord = (b: Badge) => (b.earned ? RECORD.unlocked : b.pending === "earn" ? RECORD.pendingEarn : RECORD.locked);
  return (
    <section className="bdg" aria-label={RECORD.badges}>
      <header className="bdg-head">
        <div className="bdg-head-main">
          <span className="bdg-count">{RECORD.unlockedCount(earned, badges.length)}</span>
          {next ? <span className="bdg-next">{RECORD.nextBadge(words(next.id).name)}</span> : null}
        </div>
        {reputation ? (
          <div className="bdg-tier">
            <span className="bdg-tier-chip">{RECORD.tiers[reputation.tier] ?? reputation.tier}</span>
            <span className="bdg-tier-line">{tierLine(reputation)}</span>
          </div>
        ) : null}
      </header>
      <ul className="bdg-list">
        {badges.map((b) => {
          const Icon = ICONS[b.id] ?? BadgeCheck;
          const state = stateOf(b);
          const p = b.progress;
          return (
            <li key={b.id} className="bdg-item" data-state={state} aria-label={`${words(b.id).name} - ${stateWord(b)}`}>
              <span className="bdg-icon" aria-hidden><Icon strokeWidth={1.9} /></span>
              <span className="bdg-body">
                <span className="bdg-name">{words(b.id).name}</span>
                <span className="bdg-desc">{words(b.id).description}</span>
                {state === "next" && p ? (
                  <span className="bdg-progress">
                    <span className="bdg-bar" role="progressbar" aria-valuenow={p.have} aria-valuemin={0} aria-valuemax={p.need} aria-label={RECORD.progressOf(p.have, p.need)}>
                      <span style={{ "--bdg-share": `${Math.round((p.have / p.need) * 100)}%` } as CSSProperties} />
                    </span>
                    <span className="bdg-of numbers">{RECORD.progressOf(p.have, p.need)}</span>
                  </span>
                ) : null}
              </span>
              <span className="bdg-state">{state === "next" ? RECORD.nextWord : stateWord(b)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
