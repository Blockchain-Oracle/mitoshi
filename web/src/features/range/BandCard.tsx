"use client";
/**
 * The band (R4-5, D-227; Ported from Owarine 90a91d71:web/src/features/range/BandControl.tsx + range-band.css): the
 * bounds From → To in mono with the centre's − / + on the asset's grid flanking them, Mitoshi's two-thumb BandSlider
 * over the model's distribution (21st 31347 + 32784; 48 px bars on a phone), the foot "BTC now $X · opened $Y" with ⟲
 * recentre and an "inside now / outside now" chip that follows the live price, the three widths with their spans, and
 * inside / outside. The band is anchored (useRangeDraft): the live price moves the marker and the chip, never the band.
 */
import type { RangeSide } from "@cwf/core/range";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { BandSlider, type BandBar } from "@/components/ui/band-slider";
import { WaitingText } from "@/components/states/WaitingText";
import { cn } from "@/lib/utils";
import { RANGE } from "./copy";
import { usdBand, usdOnGrid } from "./format";
import { RANGE_PRESETS, bandHalfUsd } from "./presets";
import type { RangeDraft } from "./useRangeDraft";

export function BandCard({ asset, intervalSec, draft, bars, side, onSide, openingPrint, spotLate = false }: { asset: string; intervalSec: number; draft: RangeDraft; bars: readonly BandBar[]; side: RangeSide; onSide?: (side: RangeSide) => void; openingPrint: bigint | null; spotLate?: boolean }) {
  const { band } = RANGE;
  const usd = (n: number) => usdOnGrid(n, draft.decimals);
  const ready = draft.axis !== null && draft.lowUsd !== null && draft.highUsd !== null;
  const step = usd(draft.unit);
  return (
    <div className="bc">
      <div className="bc-card">
        {ready ? (
          <>
            <div className="bc-bounds">
              <button type="button" className="bc-nudge" onClick={() => draft.nudge(-1)} aria-label={band.lower(step)} title={band.lower(step)}>
                <Minus aria-hidden className="size-4" />
              </button>
              <div className="bc-edge">
                <span className="bc-k">{band.from}</span>
                <strong className="bc-v numbers">{usd(draft.lowUsd!)}</strong>
              </div>
              <span className="bc-arrow" aria-hidden>→</span>
              <div className="bc-edge bc-edge--right">
                <span className="bc-k">{band.to}</span>
                <strong className="bc-v numbers">{usd(draft.highUsd!)}</strong>
              </div>
              <button type="button" className="bc-nudge" onClick={() => draft.nudge(1)} aria-label={band.higher(step)} title={band.higher(step)}>
                <Plus aria-hidden className="size-4" />
              </button>
            </div>
            <BandSlider
              className="bc-slider"
              min={draft.axis!.min}
              max={draft.axis!.max}
              step={draft.unit}
              value={[draft.lowUsd!, draft.highUsd!]}
              onChange={([lo, hi]) => draft.setEdges(lo, hi)}
              bars={bars}
              format={usd}
              label={band.bars(asset)}
              lowLabel={band.low}
              highLabel={band.high}
              marker={draft.spotUsd}
              markerLabel={draft.spotUsd !== null ? `${band.now(asset)} ${usd(draft.spotUsd)}` : undefined}
            />
            <div className="bc-foot">
              <span className="numbers">
                {draft.spotUsd !== null ? `${band.now(asset)} ${usd(draft.spotUsd)}` : band.waiting}
                {openingPrint !== null ? ` · ${band.opened(usdBand(openingPrint))}` : ""}
              </span>
              {draft.insideNow !== null ? <span className={cn("bc-now", draft.insideNow ? "is-in" : "is-out")}>{draft.insideNow ? band.insideNow : band.outsideNow}</span> : null}
              <button type="button" className="bc-recenter" onClick={draft.recenter} aria-label={band.recenter} title={band.recenter}>
                <RotateCcw aria-hidden className="size-4" />
              </button>
            </div>
          </>
        ) : (
          // The price's wait, named (R6 games §4.3.4): shimmering words, then "Price feed is late" at 10 s — the CTA
          // under it carries Retry and, when one is fresh, another Window.
          spotLate ? <p role="status" className="bc-wait">{band.late}</p> : <WaitingText as="p" timeoutMs={null} className="bc-wait">{band.waiting}</WaitingText>
        )}
      </div>

      <div className="bc-presets" role="group" aria-label={band.width}>
        {RANGE_PRESETS.map((p) => {
          const on = draft.preset === p.key;
          return (
            <button key={p.key} type="button" className="bc-preset" aria-pressed={on} onClick={() => draft.setPreset(p.key)}>
              <span className="bc-preset-name">{band.presets[p.key]}</span>
              <span className="bc-preset-span numbers">{band.span(usd(bandHalfUsd(p.key, intervalSec, draft.anchorUsd) * 2))}</span>
            </button>
          );
        })}
      </div>

      {onSide ? (
        <div className="bc-sides" role="radiogroup" aria-label={band.sideLabel} aria-description={band.mustFinish(asset, side)}>
          {(["inside", "outside"] as const).map((option) => (
            <button key={option} type="button" role="radio" aria-checked={side === option} className="bc-side" onClick={() => onSide(option)}>
              {option === "inside" ? band.inside : band.outside}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
