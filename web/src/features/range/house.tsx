"use client";
/**
 * What Range and Moonshot share (R4-5, D-227): the Windows with the pick and the empty line ("No open Window · next in
 * m:ss", the next start read from the lanes, not a fixed five minutes), and the head — the rounds chip (only this
 * page's kind; "Claim $X" while one is won) and the ⓘ sheet with the reserve's figures.
 */
import type { MarketId } from "@cwf/core";
import type { RangeReserveState } from "@cwf/core/range";
import { useState } from "react";
import { formatLeft } from "@/components/kit";
import { ErrorState, LoadingState } from "@/components/states";
import { useNowMs } from "@/lib/clock";
import { usePersistedState } from "@/lib/persisted";
import { useWalletSession } from "@/lib/wallet-session";
import { usd, utilizationPct } from "../parlay/format";
import { RANGE } from "./copy";
import { useRangeWindows, type BandWindow } from "./data";
import { GameHead } from "./GameHead";
import { RangeRounds, useRoundsSummary, type RoundKind } from "./RangeRounds";
import type { useRangeWrites } from "./useRangeWrites";
import { cadenceKeyOf } from "./WindowPicker";

const KEY_CODEC = { parse: (raw: string) => raw, serialize: (v: string) => v };
const laneOf = (w: BandWindow) => `${w.market.asset}|${w.market.lane}|${w.market.intervalSec}`;

export function useHouseWindows(reserve: RangeReserveState, storageKey: string) {
  const nowMs = useNowMs();
  const { windows, nextOpenSec, gapInSec, loading, error } = useRangeWindows(nowMs, reserve.params.minTimeLeftSec, reserve.params.maxHorizonSec);
  const [picked, setPickedState] = useState<{ id: MarketId; lane: string } | null>(null);
  const [cadence, setCadence] = usePersistedState<string>(`cwf:${storageKey}:cadence`, "", KEY_CODEC);
  const priced = windows.filter((w) => w.model !== null);
  // The pick; when its Window closes, the next one of the same lane; else the remembered cadence's soonest; else the soonest.
  const current: BandWindow | null =
    priced.find((w) => w.market.marketId === picked?.id) ??
    (picked ? priced.find((w) => laneOf(w) === picked.lane) : undefined) ??
    priced.find((w) => cadenceKeyOf(w.market) === cadence) ??
    priced[0] ??
    null;
  const setPicked = (id: MarketId) => {
    const w = priced.find((x) => x.market.marketId === id);
    if (!w) return;
    setPickedState({ id, lane: laneOf(w) });
    setCadence(cadenceKeyOf(w.market));
  };
  const empty = loading && priced.length === 0 ? <LoadingState shape="row" label={RANGE.band.waiting} /> : error && priced.length === 0 ? <ErrorState diagnosis={error} /> : priced.length === 0 ? <p className="gw-empty">{nextOpenSec !== null ? RANGE.windows.none(formatLeft(nextOpenSec * 1000 - nowMs)) : RANGE.windows.noneLater}</p> : null;
  return { nowMs, windows, current, setPicked, empty, gapInSec };
}

export function HouseHead({ title, kind, reserve, writes, how, infoTitle }: { title: string; kind: RoundKind; reserve: RangeReserveState; writes: ReturnType<typeof useRangeWrites>; how: readonly string[]; infoTitle: string }) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const summary = useRoundsSummary(session.address, kind);
  return (
    <GameHead
      title={title}
      chip={summary.claimBase > 0n ? RANGE.head.claim(usd(summary.claimBase)) : RANGE.head.rounds(summary.count)}
      chipAccent={summary.claimBase > 0n}
      sheetTitle={RANGE.sections.rounds.title}
      sheet={<RangeRounds kind={kind} wallet={session.address} nowMs={nowMs} staleAfterSec={reserve.params.staleAfterSec} writes={writes} onSignIn={session.connect} />}
      infoTitle={infoTitle}
      how={how}
      facts={
        <>
          <p className="numbers">{RANGE.info.reserve(usd(reserve.liquidBase), utilizationPct(reserve.utilizationBps))}</p>
          <p>{RANGE.info.atMost}</p>
        </>
      }
    />
  );
}

