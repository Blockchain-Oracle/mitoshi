"use client";
// Ported from Owarine 90a91d71:web/src/features/surface/SurfaceChips.tsx (R4-11, D-227): asset pills, then one chip per
// live Window of the asset, nearest close first, each with its cadence and clock. Both rows ride the kit's ScrollRail
// (R4-2's open item for R4-11): one line each that scrolls sideways, keyboard reachable, never wrapping into a stack.
import type { EventMarket, MarketId } from "@cwf/core";
import { formatCadence } from "@cwf/core";
import { formatClock, remainingSec } from "@cwf/core/units";
import { ScrollRail } from "@/components/kit";
import { cn } from "@/lib/utils";
import { SURFACE } from "./copy";

export function SurfaceChips({ assets, asset, onAsset, windows, focalId, onFocal, nowMs }: { assets: readonly string[]; asset: string | null; onAsset: (a: string) => void; windows: readonly EventMarket[]; focalId: MarketId | null; onFocal: (id: MarketId) => void; nowMs: number }) {
  return (
    <div className="sf-chips">
      <ScrollRail label={SURFACE.chips.assets} className="sf-chips-group">
        {assets.map((a) => (
          <button key={a} type="button" className={cn("sf-chip sf-chip--asset", asset === a && "sf-chip--on")} aria-pressed={asset === a} onClick={() => onAsset(a)}>{a}</button>
        ))}
      </ScrollRail>
      {windows.length > 1 ? (
        <ScrollRail label={SURFACE.chips.windows} className="sf-chips-group">
          {windows.map((m) => {
            const left = nowMs > 0 ? remainingSec(nowMs, m.expirySec) : 0;
            return (
              <button key={m.marketId} type="button" className={cn("sf-chip sf-chip--window", focalId === m.marketId && "sf-chip--on")} aria-pressed={focalId === m.marketId} onClick={() => onFocal(m.marketId)}>
                {formatCadence(m.intervalSec)}
                <span className="sf-chip-clock">{left > 0 ? formatClock(left) : "—"}</span>
              </button>
            );
          })}
        </ScrollRail>
      ) : null}
    </div>
  );
}
