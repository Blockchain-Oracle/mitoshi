"use client";
/**
 * `/games/moonshot` (Ported from Masayume 68f7a09:web/src/features/games/moonshot/MoonshotScreen.tsx). R4-5 (D-227):
 * Owarine 90a91d71's product on one phone screen, as /games/range — the 40 px head (your moonshots and ⓘ in sheets),
 * the cadence words and Window chips over every Window the reserve can price, the aim pad and the distance gauge, then
 * the action block above the dock. Your moonshots (only these: range rounds with one edge open) follow.
 */
import type { RangeReserveState } from "@cwf/core/range";
import { EmptyState, ReadingBoundary } from "@/components/states";
import { useWalletSession } from "@/lib/wallet-session";
import { RANGE } from "../../range/copy";
import { useRangeReserve } from "../../range/data";
import { RangeRounds } from "../../range/RangeRounds";
import { HouseHead, useHouseWindows } from "../../range/house";
import { useRangeWrites } from "../../range/useRangeWrites";
import { WindowPicker } from "../../range/WindowPicker";
import { MOONSHOT } from "./copy";
import { MoonshotTicket } from "./MoonshotTicket";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { game as gameShape } from "@/components/states/shapes/games";

function Page({ reserve }: { reserve: RangeReserveState }) {
  const session = useWalletSession();
  const writes = useRangeWrites(session.address);
  const { nowMs, windows, current, setPicked, empty, gapInSec } = useHouseWindows(reserve, "moonshot");
  return (
    <>
      <HouseHead title={MOONSHOT.title} kind="moonshot" reserve={reserve} writes={writes} how={MOONSHOT.how} infoTitle={MOONSHOT.infoTitle} />
      <WindowPicker windows={windows} pickedId={current?.market.marketId ?? null} onPick={setPicked} gapInSec={gapInSec} />
      {empty}
      {current ? <MoonshotTicket key={current.market.marketId} market={current.market} model={current.model} reserve={reserve} /> : null}
      <section className="game-below" aria-label={MOONSHOT.roundsTitle}>
        <h2 className="game-below-title">{MOONSHOT.roundsTitle}</h2>
        <RangeRounds kind="moonshot" wallet={session.address} nowMs={nowMs} staleAfterSec={reserve.params.staleAfterSec} writes={writes} onSignIn={session.connect} />
      </section>
    </>
  );
}

export function MoonshotScreen() {
  const reading = useRangeReserve();
  return (
    <div className="game-page">
      <ReadingBoundary reading={reading} placeholder={<LoadingFrame shape="game">{gameShape()}</LoadingFrame>}>
        {(reserve) => (reserve ? <Page reserve={reserve} /> : <EmptyState why={MOONSHOT.notDeployed.why} detail={MOONSHOT.notDeployed.body} />)}
      </ReadingBoundary>
    </div>
  );
}
