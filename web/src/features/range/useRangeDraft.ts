"use client";
/**
 * The band being composed (Ported from Masayume 68f7a09:web/src/features/range/useRangeDraft.ts): a width preset
 * scaled per cadence and asset, a centre around the live price on the asset's grid, clamped to the cadence's limit —
 * now edited by the two thumbs of the band slider (21st 31347) as well as the presets, so a thumb moves one edge and
 * the draft keeps the grid, the least width and the centre limit. Prices are dollars at the UI boundary and cents
 * (the engine print / 1e6) on the wire.
 */
import { useCallback, useState } from "react";
import { printToUsd, usdToPrint } from "./format";
import { bandHalfUsd, bandUnitUsd, centerMaxUsd, snapOffset, trackHalfUsd, unitDecimals, type RangePresetKey } from "./presets";

export interface RangeDraft {
  preset: RangePresetKey;
  setPreset: (key: RangePresetKey) => void;
  unit: number;
  decimals: number;
  spotUsd: number | null;
  lowUsd: number | null;
  highUsd: number | null;
  lowPrint: bigint | null;
  highPrint: bigint | null;
  /** The slider's axis around spot. */
  axis: { min: number; max: number } | null;
  setEdges: (low: number, high: number) => void;
  recenter: () => void;
}

const round = (v: number, d: number) => Number(v.toFixed(d));

export function useRangeDraft(spotPrint: bigint | null, intervalSec: number): RangeDraft {
  const [preset, setPresetState] = useState<RangePresetKey>("medium");
  const [offset, setOffset] = useState(0);
  const [customHalf, setCustomHalf] = useState<number | null>(null);
  const spotUsd = spotPrint === null ? null : printToUsd(spotPrint);
  const unit = bandUnitUsd(spotUsd);
  const decimals = unitDecimals(unit);
  const presetHalf = bandHalfUsd(preset, intervalSec, spotUsd);
  const half = customHalf ?? presetHalf;
  const centerMax = centerMaxUsd(intervalSec, spotUsd);
  const axisHalf = trackHalfUsd(bandHalfUsd("wide", intervalSec, spotUsd), centerMax, unit);
  const clamped = Math.max(-centerMax, Math.min(centerMax, offset));
  const center = spotUsd === null ? null : round(Math.round((spotUsd + clamped) / unit) * unit, decimals);
  const lowUsd = center === null ? null : round(center - half, decimals);
  const highUsd = center === null ? null : round(center + half, decimals);

  const setPreset = useCallback((key: RangePresetKey) => {
    setPresetState(key);
    setCustomHalf(null);
  }, []);
  const setEdges = useCallback(
    (low: number, high: number) => {
      if (spotUsd === null) return;
      const nextHalf = Math.max(unit, round(Math.round((high - low) / 2 / unit) * unit, decimals));
      setCustomHalf(nextHalf);
      setOffset(snapOffset((low + high) / 2 - spotUsd, centerMax, unit));
    },
    [spotUsd, unit, decimals, centerMax],
  );
  const recenter = useCallback(() => setOffset(0), []);
  return {
    preset,
    setPreset,
    unit,
    decimals,
    spotUsd,
    lowUsd,
    highUsd,
    lowPrint: lowUsd === null ? null : usdToPrint(lowUsd),
    highPrint: highUsd === null ? null : usdToPrint(highUsd),
    axis: spotUsd === null ? null : { min: round(spotUsd - axisHalf, decimals), max: round(spotUsd + axisHalf, decimals) },
    setEdges,
    recenter,
  };
}
