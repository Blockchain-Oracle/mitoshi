// Ported from Masayume 68f7a09:web/src/features/markets/hero/HeroQuestion.tsx — the question over the Window's signed
// opening print; before it exists the headline names the pair instead of inventing a level. R4-0 (D-227): the level
// and its "?" never part (`.mh-question-end`), and a pending line ellipsizes instead of breaking word by word.
import { neededMove } from "@cwf/core";
import { cn } from "@/lib/utils";
import { HERO, HERO_HEAD } from "../copy";
import { usd0 } from "../units";

export function HeroQuestion({ asset, openingRaw, currentRaw }: { asset: string; openingRaw: bigint | null; currentRaw: bigint | null }) {
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
              <span className="mh-question-line">{usd0(openingRaw)}</span>?
            </span>
          </>
        )}
      </h2>
      <div className="mh-distance" aria-live="off">
        {openingRaw === null ? (
          <span className="mh-distance-pending">{HERO.pendingDistance}</span>
        ) : currentRaw === null || move === null ? (
          <span className="mh-distance-pending">{HERO.noLivePrice}</span>
        ) : (
          <span className={cn("mh-distance-value", winning ? "above" : "below")}>
            {winning ? `${usd0(currentRaw - openingRaw)} ${HERO_HEAD.aboveLine}` : `${HERO_HEAD.needs} +${usd0(move.upNeedsRaw)} ${HERO_HEAD.needsForUp}`}
          </span>
        )}
      </div>
    </>
  );
}
