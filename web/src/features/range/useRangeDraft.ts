"use client";
/**
 * The band being composed (Ported from Masayume 68f7a09:web/src/features/range/useRangeDraft.ts): a width preset
 * scaled per cadence and asset, a centre on the asset's grid, clamped to the cadence's limit — edited by the two
 * thumbs of the band slider (21st 31347), the presets and the centre nudges. Prices are dollars at the UI boundary and
 * cents (the engine print / 1e6) on the wire.
 * R4-5 (D-227, Ported from Owarine 90a91d71:web/src/features/range/BandControl.tsx — the reserve's centre apart from
 * the live dot): the band is anchored. The anchor is the first live price, set again on ⟲ recentre (a new Window
 * remounts the ticket); the centre is anchor + offset. The live price only moves the marker and `insideNow`, so a tick
 * never changes the band, the quote's signature or the hold.
 */
import { useCallback, useState } from "react";
import { printToUsd, usdToPrint } from "./format";
import { bandHalfUsd, bandUnitUsd, centerMaxUsd, snapOffset, trackHalfUsd, unitDecimals, type RangePresetKey } from "./presets";

export interface RangeDraft {
  preset: RangePresetKey;
  setPreset: (key: RangePresetKey) => void;
  unit: number;
  decimals: number;
  /** The live price (the marker); null until the first one. */
  spotUsd: number | null;
  /** Where the band was anchored (the first live price, or the last recentre). */
  anchorUsd: number | null;
  lowUsd: number | null;
  highUsd: number | null;
  lowPrint: bigint | null;
  highPrint: bigint | null;
  /** The live price sits inside the band's edges right now. */
  insideNow: boolean | null;
  /** The slider's axis around the anchor. */
  axis: { min: number; max: number } | null;
  setEdges: (low: number, high: number) => void;
  /** Moves the centre one grid step (`dir` −1 or +1), within the cadence's limit. */
  nudge: (dir: -1 | 1) => void;
  recenter: () => void;
}

const round = (v: number, d: number) => Number(v.toFixed(d));

export function useRangeDraft(spotPrint: bigint | null, intervalSec: number): RangeDraft {
  const [preset, setPresetState] = useState<RangePresetKey>("medium");
  const [offset, setOffset] = useState(0);
  const [customHalf, setCustomHalf] = useState<number | null>(null);
  const spotUsd = spotPrint === null ? null : printToUsd(spotPrint);
  // Anchored on the first live price (set during render once, React's "adjust state on a prop" pattern).
  const [anchorUsd, setAnchor] = useState<number | null>(spotUsd);
  if (anchorUsd === null && spotUsd !== null) setAnchor(spotUsd);
  const base = anchorUsd ?? spotUsd;
  const unit = bandUnitUsd(base);
  const decimals = unitDecimals(unit);
  const presetHalf = bandHalfUsd(preset, intervalSec, base);
  const half = customHalf ?? presetHalf;
  const centerMax = centerMaxUsd(intervalSec, base);
  const axisHalf = trackHalfUsd(bandHalfUsd("wide", intervalSec, base), centerMax, unit);
  const clamped = Math.max(-centerMax, Math.min(centerMax, offset));
  const center = base === null ? null : round(Math.round((base + clamped) / unit) * unit, decimals);
  const lowUsd = center === null ? null : round(center - half, decimals);
  const highUsd = center === null ? null : round(center + half, decimals);

  const setPreset = useCallback((key: RangePresetKey) => {
    setPresetState(key);
    setCustomHalf(null);
  }, []);
  const setEdges = useCallback(
    (low: number, high: number) => {
      if (base === null) return;
      const nextHalf = Math.max(unit, round(Math.round((high - low) / 2 / unit) * unit, decimals));
      setCustomHalf(nextHalf);
      setOffset(snapOffset((low + high) / 2 - base, centerMax, unit));
    },
    [base, unit, decimals, centerMax],
  );
  const nudge = useCallback((dir: -1 | 1) => setOffset((o) => snapOffset(Math.max(-centerMax, Math.min(centerMax, o)) + dir * unit, centerMax, unit)), [centerMax, unit]);
  const recenter = useCallback(() => {
    setOffset(0);
    if (spotUsd !== null) setAnchor(spotUsd);
  }, [spotUsd]);
  return {
    preset,
    setPreset,
    unit,
    decimals,
    spotUsd,
    anchorUsd,
    lowUsd,
    highUsd,
    lowPrint: lowUsd === null ? null : usdToPrint(lowUsd),
    highPrint: highUsd === null ? null : usdToPrint(highUsd),
    insideNow: spotUsd === null || lowUsd === null || highUsd === null ? null : spotUsd >= lowUsd && spotUsd <= highUsd,
    axis: base === null ? null : { min: round(base - axisHalf, decimals), max: round(base + axisHalf, decimals) },
    setEdges,
    nudge,
    recenter,
  };
}
