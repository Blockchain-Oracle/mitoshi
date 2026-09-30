// Ported from Masayume 68f7a09:web/src/features/markets/verdict/{VerdictStamp,VerdictLegs,PnlFigure}.tsx — the pressed
// stamp (kanji with romaji and translation beneath, so the verdict never depends on Japanese or colour; vermilion is
// 正夢's alone), the legs in words (a losing leg listed at 0, never hidden) and the one P&L figure.
import { OUTCOME_TO_SIDE, type ClaimLeg, type Verdict, type VerdictOutcome } from "@cwf/core";
import { verdictStrings } from "@cwf/core/copy";
import { Money } from "@/components/data";
import { cn } from "@/lib/utils";
import { MARKETS, VERDICT_UI } from "../copy";

const STAMP_INK: Record<VerdictOutcome, string> = {
  win: "text-(--verdict-stamp-win-ink)",
  loss: "text-(--verdict-stamp-loss-ink)",
  void: "text-(--verdict-stamp-void-ink)",
};

export function VerdictStamp({ outcome, size = "hero", className }: { outcome: VerdictOutcome; size?: "hero" | "compact"; className?: string }) {
  const s = verdictStrings(outcome);
  return (
    <div className={cn("stamp-press inline-flex flex-col items-start", className)}>
      <span lang="ja" className={cn(size === "hero" ? "type-stamp-hero" : "type-stamp", STAMP_INK[outcome])}>{s.kanji}</span>
      <span className="type-label-micro normal-case text-ink-secondary">
        <span lang="ja-Latn">{s.romaji}</span> · {s.translation}
      </span>
    </div>
  );
}

const SIDE = { up: MARKETS.up, down: MARKETS.down } as const;

export function VerdictLegs({ legs, decimals }: { legs: readonly ClaimLeg[]; decimals: number }) {
  return (
    <dl className="flex flex-col gap-2" aria-label={VERDICT_UI.legs}>
      {legs.map((leg) => (
        <div key={leg.outcomeIdx} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2 type-data">
          <dt className="flex items-baseline gap-2">
            <span className="type-body-strong text-ink">{SIDE[OUTCOME_TO_SIDE[leg.outcomeIdx]]}</span>
            <span className="text-ink-secondary"><Money value={leg.amountRaw} decimals={decimals} /> {VERDICT_UI.contracts}</span>
          </dt>
          <dd className="text-ink-secondary">{VERDICT_UI.payout} <Money value={leg.payoutBase} decimals={decimals} className="text-ink" /></dd>
        </div>
      ))}
    </dl>
  );
}

export function PnlFigure({ verdict, className }: { verdict: Verdict; className?: string }) {
  const costKnown = verdict.costBasisBase !== null;
  return (
    <div className={cn("flex flex-col items-end gap-1 text-right", className)}>
      <span className="type-label-micro text-ink-muted">{costKnown ? VERDICT_UI.netPnl : VERDICT_UI.paidOut}</span>
      <Money value={verdict.pnlBase} decimals={verdict.decimals} tone="pnl" className="type-data-hero" />
      {!costKnown && <span className="type-caption text-ink-muted">{VERDICT_UI.costUnknown}</span>}
    </div>
  );
}
