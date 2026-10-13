"use client";

import { PRICE_STALE_AFTER_MS } from "@cwf/core/constants";
import { PRACTICE_WATCH_SEC, type DeckCard } from "@cwf/core/games";
import { secToMs } from "@cwf/core/units";
import { useCallback, useEffect, useRef } from "react";
import { Odometer } from "@/components/kit/Odometer";
import { EmptyState, ErrorState, StaleTick, WaitingText } from "@/components/states";
import { keys } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { diagnosis } from "@cwf/core";
import { useMarketSession } from "@/features/markets/session/useMarketSession";
import { booleanCodec, usePersistedState } from "@/lib/persisted";
import { startBgm, stopBgm } from "../audio";
import { useImmersive, useGames } from "../GamesProvider";
import { useCrowdPct } from "../hall/data";
import { gameKey } from "../keys";
import { tickerOf } from "../lanes";
import { StageFace } from "../stage/StageFace";
import { SwipeDeck, type DeckPlace } from "../stage/SwipeDeck";
import { DeckSkeleton } from "../stage/DeckSkeleton";
import { DeckStrip, type TileResult } from "../stage/DeckStrip";
import { CardLine } from "./BeatParts";
import { PRACTICE } from "./copy";
import { PracticeResult, useReveal } from "./PracticeResult";
import { PracticeWatch } from "./PracticeWatch";
import { PriceProbe } from "./PriceProbe";
import { usePracticeRound } from "./usePracticeRound";
import "./practice.css";
import "@/components/kit/kit.css";

/**
 * `/games/practice` — Beat the coin (R4-9, D-227; ported from Senryo:apps/web/src/features/games/WarmUpScreen.tsx, on
 * Owarine 90a91d71's PracticeStage and Mitoshi's shared SwipeDeck). Five live Windows dealt with their sound; each card
 * carries the asset's live line, the rolling price and the crowd's lean; after each swipe the coin's pick flips in on
 * the slot strip; then five races for thirty seconds, revealed 220 ms apart, confetti on a win. The frame goes
 * immersive while a round is dealt (no dock, no top line on a phone), so the calls are on the first screen. The rules
 * and the honesty line ("scored on the live price 30 s after each swipe, not at settlement") live behind ⓘ.
 * Nothing here reads or writes a wallet: `economicKindOf("practice")` is `none`.
 */
const TUTORIAL_KEY = gameKey("practiceSeen");
const DEAL_GAP_MS = 90;

const priceNumber = (raw: bigint, decimals: number): number => Number(raw) / 10 ** decimals;

function CrowdPill({ asset }: { asset: string }) {
  const pct = useCrowdPct(tickerOf(asset));
  return pct === null ? <span className="st-question-pending">—</span> : <span>{PRACTICE.card.crowdUp(pct)}</span>;
}

export function PracticeStage() {
  const session = usePracticeRound();
  const market = useMarketSession();
  const { feedback } = useGames();
  const [seen, setSeen, hydrated] = usePersistedState(TUTORIAL_KEY, false, booleanCodec);
  const { readiness, round, score } = session;
  const shown = useReveal(score);
  const dealt = readiness.kind === "ready";
  useImmersive(dealt && (score === null || shown <= score.cards.length));

  // The deal sounds card by card; the bed plays from the first deal (never on the hub) and stops on leaving.
  const dealtSeed = useRef("");
  useEffect(() => {
    if (!round.seed || round.seed === dealtSeed.current) return;
    dealtSeed.current = round.seed;
    startBgm();
    round.cards.forEach((_, i) => window.setTimeout(() => feedback("click"), i * DEAL_GAP_MS));
  }, [round.seed, round.cards, feedback]);
  useEffect(() => () => stopBgm(), []);

  const pick = session.pick;
  const onPick = useCallback(
    (card: DeckCard, side: "up" | "down") => {
      pick(card, side);
      if (!seen) setSeen(true);
    },
    [pick, seen, setSeen],
  );

  const renderFace = useCallback(
    (card: DeckCard, place: DeckPlace) => {
      const price = session.priceOf(card.asset);
      const agedMs = price ? session.nowMs - secToMs(price.blockTimestampSec) : 0;
      const aged = price !== null && session.nowMs > 0 && agedMs > PRICE_STALE_AFTER_MS;
      return (
        <StageFace
          card={card}
          place={place}
          nowMs={session.nowMs || undefined}
          eyebrow={PRACTICE.card.eyebrow(tickerOf(card.asset))}
          question={PRACTICE.card.question}
          line={<CardLine asset={card.asset} nowMs={session.nowMs} entryE8={null} />}
          coach={hydrated && !seen && place.position === 1 ? PRACTICE.card.coach : null}
          clock={{ kind: "watch", sec: PRACTICE_WATCH_SEC }}
          pills={[
            {
              label: PRACTICE.card.live,
              value: price ? (
                <>
                  <Odometer kind="usd" value={priceNumber(price.priceRaw, price.decimals)} />
                  {aged && <StaleTick asOfMs={secToMs(price.blockTimestampSec)} reason="aged" compact />}
                </>
              ) : (
                <span className="st-question-pending">{PRACTICE.card.noPrice}</span>
              ),
              tone: "live",
            },
            { label: PRACTICE.card.crowd, value: <CrowdPill asset={card.asset} /> },
          ]}
        />
      );
    },
    [session, hydrated, seen],
  );

  // Revealed 220 ms apart (`useReveal`); a swiped card that never got its close says "No price" rather than a verdict.
  const results: TileResult[] = round.cards.map((_, i) => {
    if (!score || i >= shown) return null;
    const scored = score.cards.find((c) => c.card.index === i);
    return scored ? scored.you : round.picks.some((p) => p.cardIndex === i) ? "unscored" : null;
  });

  return (
    <div className="gm-page pr-stage">
      {session.assets.map((asset) => (
        <PriceProbe key={asset} asset={asset} onPrice={session.reportPrice} />
      ))}

      {dealt ? (
        <>
          <DeckStrip seed={round.seed} cards={round.cards} picks={round.picks} active={session.active} closesAtMs={session.closesAtMs} results={results} nowMs={session.nowMs} />
          {score ? (
            <PracticeResult round={round} score={score} shown={shown} onAgain={session.deal} />
          ) : round.phase === "watching" ? (
            <PracticeWatch round={round} leftSec={session.watchLeftSec} priceOf={session.priceOf} closesAtMs={session.closesAtMs} />
          ) : (
            <SwipeDeck
              cards={round.cards}
              active={session.active}
              playedSide={session.playedSide}
              onPick={onPick}
              refusal={session.active && !session.priceOf(session.active.asset) ? PRACTICE.wait.price : null}
              renderFace={renderFace}
              strip="none"
            />
          )}
        </>
      ) : (
        <Plate readiness={readiness.kind} closed={market !== null && !market.open} />
      )}
    </div>
  );
}

/**
 * Dealing, nothing dealable, or the Windows unreadable — three different states, never merged (R6 games §4.2.5): the
 * deck's own skeleton under a named wait that turns honest after 15 s; an empty state with the way to a game that needs
 * no Window; an error with Retry (the lanes read again).
 */
function Plate({ readiness, closed }: { readiness: "dealing" | "no-deck" | "unreadable"; closed: boolean }) {
  const client = useQueryClient();
  const retry = () => void client.invalidateQueries({ queryKey: keys.lanes() });
  const lineRider = { label: PRACTICE.wait.lineRider, href: "/games/line-rider" };
  if (readiness === "dealing") {
    return (
      <>
        <DeckSkeleton />
        <WaitingText as="p" onRetry={retry} timeout={{ title: PRACTICE.wait.late, action: lineRider }}>{PRACTICE.wait.dealing}</WaitingText>
      </>
    );
  }
  if (readiness === "no-deck") {
    const none = PRACTICE.deal.none;
    return <EmptyState why={closed ? none.closedTitle : none.title} detail={closed ? none.closedBody : none.body} nextAction={lineRider} />;
  }
  return <ErrorState diagnosis={diagnosis("indexer-down", "lanes unreadable")} retry={retry} />;
}
