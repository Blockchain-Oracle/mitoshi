"use client";
/**
 * `/games/range` (Ported from Masayume 68f7a09:web/src/features/range/RangeScreen.tsx — "its Ticket's range mode on the
 * parlay page's frame"). R4-5 (D-227): Owarine 90a91d71's product on one phone screen — the 40 px head (rounds and ⓘ
 * in sheets), the cadence words and Window chips over every Window the reserve can price, the band, then the action
 * block stuck above the dock; from 1024 the band and the action sit side by side. Your rounds follow, no description.
 * A Window the reserve can't price is a disabled chip with its reason, never offered then refused.
 */
import type { RangeReserveState } from "@cwf/core/range";
import { EmptyState, ReadingBoundary } from "@/components/states";
import { useWalletSession } from "@/lib/wallet-session";
import { RANGE } from "./copy";
import { useRangeReserve } from "./data";
import { HouseHead, useHouseWindows } from "./house";
import { RangeRounds } from "./RangeRounds";
import { RangeTicketBody } from "./RangeTicketBody";
import { useRangeWrites } from "./useRangeWrites";
import { WindowPicker } from "./WindowPicker";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { game as gameShape } from "@/components/states/shapes/games";

function Page({ reserve }: { reserve: RangeReserveState }) {
  const session = useWalletSession();
  const writes = useRangeWrites(session.address);
  const { nowMs, windows, current, setPicked, empty, gapInSec } = useHouseWindows(reserve, "range");
  return (
    <>
      <WindowPicker windows={windows} pickedId={current?.market.marketId ?? null} onPick={setPicked} gapInSec={gapInSec} aside={<HouseHead kind="range" reserve={reserve} writes={writes} />} />
      {empty}
      {current ? <RangeTicketBody key={current.market.marketId} market={current.market} model={current.model} reserve={reserve} allowOutside alts={{ windows, pick: setPicked }} /> : null}
      <section className="game-below" aria-label={RANGE.sections.rounds.title}>
        <h2 className="game-below-title">{RANGE.sections.rounds.title}</h2>
        <RangeRounds kind="range" wallet={session.address} nowMs={nowMs} staleAfterSec={reserve.params.staleAfterSec} writes={writes} onSignIn={session.connect} />
      </section>
    </>
  );
}

export function RangeScreen() {
  const reading = useRangeReserve();
  return (
    <div className="game-page">
      <ReadingBoundary reading={reading} placeholder={<LoadingFrame shape="game">{gameShape()}</LoadingFrame>}>
        {(reserve) => (reserve ? <Page reserve={reserve} /> : <EmptyState why={RANGE.notDeployed} />)}
      </ReadingBoundary>
    </div>
  );
}
