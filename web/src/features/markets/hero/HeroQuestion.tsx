// Ported from Masayume 68f7a09:web/src/features/markets/hero/HeroQuestion.tsx — the question over the Window's signed
// opening print; before it exists the headline names the pair instead of inventing a level. R4-0 (D-227): the level
// and its "?" never part (`.mh-question-end`), and a pending line ellipsizes instead of breaking word by word. R4-3
// (D-227), Owarine 90a91d71 `usdLine`: cents under $10,000 and the distance at its line's scale, so "NVDA holds above
// $182.37?" and its distance agree near the line. D-230: while the line is pending, a count in its place (the usual lag
// left, then how long it has waited), never a bare "Waiting for the opening print."; the reason is under UP/DOWN.
import { neededMove } from "@cwf/core";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { HERO, HERO_HEAD } from "../copy";
import { openingWaitShort } from "../data/opening-wait";
import { usePrintsState } from "../session";
import { usdLine } from "../units";

/** The wait in the distance's place, ticking as its own leaf; nothing before the open (the clock says when). */
function PendingDistance({ startSec }: { startSec: number }) {
  const prints = usePrintsState();
  const text = useClockValue((ms) => (ms > 0 && ms >= startSec * 1000 ? openingWaitShort({ startSec, nowSec: Math.floor(ms / 1000), prints }, HERO.pendingDistance) : null));
  return text ? <span className="mh-distance-pending">{text}</span> : null;
}

export function HeroQuestion({ asset, startSec, openingRaw, currentRaw }: { asset: string; startSec: number; openingRaw: bigint | null; currentRaw: bigint | null }) {
  const move = openingRaw !== null && currentRaw !== null ? neededMove(currentRaw, openingRaw) : null;
  const winning = move?.upNeedsRaw === 0n;
  return (
    <>
      <h2 className="mh-question">
        {openingRaw === null ? (
          HERO_HEAD.pair(asset)
        ) : (
          <>
            {HERO_HEAD.holdsAbove(asset)}{" "}
            <span className="mh-question-end">
              <span className="mh-question-line">{usdLine(openingRaw)}</span>?
            </span>
          </>
        )}
      </h2>
      <div className="mh-distance" aria-live="off">
        {openingRaw === null ? (
          <PendingDistance startSec={startSec} />
        ) : currentRaw === null || move === null ? (
          <span className="mh-distance-pending">{HERO.noLivePrice}</span>
        ) : (
          <span className={cn("mh-distance-value", winning ? "above" : "below")}>
            {winning ? `${usdLine(currentRaw - openingRaw, openingRaw)} ${HERO_HEAD.aboveLine}` : `${HERO_HEAD.needs} +${usdLine(move.upNeedsRaw, openingRaw)} ${HERO_HEAD.needsForUp}`}
          </span>
        )}
      </div>
    </>
  );
}
