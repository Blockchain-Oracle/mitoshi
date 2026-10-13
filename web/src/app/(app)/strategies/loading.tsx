// Per-segment loading boundary (D-050) for /strategies (R4-6, D-227): the page's own first paint — the nameplate and the
// workspace pills (Create first), the studio's placeholder, the not-advice line — so a navigation that wasn't prefetched
// draws what the page draws, and only the body is replaced (not the group's generic `page` grid first).
import { STRATEGIES } from "@/features/strategies/copy";
import { StrategiesHead } from "@/features/strategies/StrategiesHead";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { studio as studioShape } from "@/components/states/shapes/automate";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <StrategiesHead view="create" />
      <LoadingFrame shape="studio" label={STRATEGIES.loading}>{studioShape()}</LoadingFrame>
      <p className="strat-advice">{STRATEGIES.advice}</p>
    </div>
  );
}
