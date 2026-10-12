"use client";
// The reserves verdict (R4-12, D-227): Mitoshi's pressed stamp (`features/markets/verdict/VerdictStamp.tsx` — kanji with
// romaji and the word beneath, so it never depends on Japanese or colour) over Owarine 90a91d71
// `features/funding/CcRailPanel.tsx`'s one-sentence covered line, the blocks every figure was read at, and Re-check —
// the page's primary action, in the first phone screen. The re-check's chain steps show inline (21st 23569).
import type { ReserveVerdict } from "@cwf/core";
import type { ReservesView } from "@cwf/markets/stocks";
import { RefreshCw } from "lucide-react";
import { TaskSteps, type TaskStep } from "@/components/ui/task-steps";
import { blockText } from "../bridge/format";
import { RESERVES } from "./copy";

export function VerdictHero({ verdict, view, steps, busy, onRecheck }: { verdict: ReserveVerdict; view: ReservesView; steps: TaskStep[] | null; busy: boolean; onRecheck: () => void }) {
  const v = RESERVES.verdict[verdict];
  const b = view.blocks;
  const blocks = [
    RESERVES.block(RESERVES.steps.tempo, blockText(b.tempo)),
    b.base !== null ? RESERVES.block(RESERVES.steps.base, blockText(b.base)) : null,
    b.robinhood !== null ? RESERVES.block(RESERVES.steps.robinhood, blockText(b.robinhood)) : RESERVES.notLiveChain(RESERVES.steps.robinhood),
  ].filter(Boolean);
  return (
    <section className="rsv-hero" data-verdict={verdict} aria-labelledby="rsv-verdict">
      <div className="rsv-hero-top">
        <div className="rsv-stamp stamp-press" id="rsv-verdict">
          <span lang="ja" className="type-stamp rsv-kanji">{v.kanji}</span>
          <span className="type-label-micro normal-case rsv-romaji"><span lang="ja-Latn">{v.romaji}</span> · {v.word}</span>
        </div>
        <div className="rsv-hero-body">
          <p className="rsv-sentence">{RESERVES.sentence[verdict]}</p>
          <p key={b.tempo.toString()} className="numbers rsv-blocks rsv-flash">{blocks.join(" · ")}</p>
        </div>
      </div>
      <button type="button" data-primary-action="" className="rsv-recheck" onClick={onRecheck} disabled={busy} aria-label={RESERVES.recheckLabel}>
        <RefreshCw aria-hidden className={busy ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} />
        {busy ? RESERVES.rechecking : RESERVES.recheck}
      </button>
      {steps ? <TaskSteps steps={steps} label={RESERVES.steps.label} layout="row" className="rsv-steps" /> : null}
    </section>
  );
}
