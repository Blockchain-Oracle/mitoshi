// Ported from Owarine 90a91d71:web/src/features/markets/history/ReputationPanel.tsx (R4-4, D-227; over Masayume
// 68f7a09's) — the tier, the record it rests on and the distance to the next. The ladder's rule sits behind "How tiers
// work" (it was 21 words, always visible). No tier pays a bonus or cuts a fee, so none is shown.
import type { ReputationData } from "@cwf/core";
import { RECORD } from "../copy";

export function ReputationPanel({ reputation }: { reputation: ReputationData }) {
  return (
    <div className="reputation-plate">
      <div className="flex flex-col gap-1">
        <span className="type-label-micro text-ink-muted">{RECORD.tier}</span>
        <span className="reputation-tier">{RECORD.tiers[reputation.tier] ?? reputation.tier}</span>
        <span className="type-caption text-ink-secondary">{RECORD.record(reputation.bets, reputation.wins)}</span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="type-caption text-ink-secondary">{reputation.nextTier ? RECORD.next(RECORD.tiers[reputation.nextTier] ?? reputation.nextTier) : RECORD.top}</span>
        <div className="reputation-bar" role="progressbar" aria-valuenow={reputation.progressToNext} aria-valuemin={0} aria-valuemax={100} aria-label={RECORD.progress(reputation.progressToNext)} title={RECORD.rule}>
          <span style={{ width: `${reputation.progressToNext}%` }} />
        </div>
        <details className="reputation-rule">
          <summary>{RECORD.howTiers}</summary>
          <p>{RECORD.rule}</p>
        </details>
      </div>
    </div>
  );
}
