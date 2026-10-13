/**
 * A ticker the roller has paused, in the lane where its Window would sit (Ported from Owarine 90a91d71:web/src/features/
 * markets/lanes/PausedCard.tsx, R4-3 D-227): Yosuku's between-rounds slot, markup for markup. Not a button — there is
 * nothing to open. Its words come from the roller's own state on `/session` (`pausedCopy`).
 */
import { formatCadence } from "@cwf/core/copy";
import { LANE_CARD } from "../copy";
import { AssetDisc } from "../hero/AssetDisc";
import { pausedCopy } from "./paused";

export function PausedCard({ asset, intervalSec, state }: { asset: string; intervalSec: number; state: string }) {
  const { headline, why } = pausedCopy(state, asset, intervalSec);
  return (
    <div className="market-card market-card-pending">
      <div className="mc-head">
        <span className="mc-asset">
          <AssetDisc asset={asset} className="glyph" />
          <span className="mc-ticker">{asset}</span>
          <span className="mc-cadence">{formatCadence(intervalSec)}</span>
        </span>
        <span className="mc-countdown">
          <span className="clock-dot" aria-hidden />
          {LANE_CARD.paused.clock}
        </span>
      </div>
      <div className="mc-pending">
        <span className="mc-pending-dot" aria-hidden />
        <p className="mc-pending-copy">
          <strong>{headline}.</strong> {why}
        </p>
      </div>
    </div>
  );
}
