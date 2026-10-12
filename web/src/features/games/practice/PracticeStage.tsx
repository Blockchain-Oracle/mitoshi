"use client";

import { PRICE_STALE_AFTER_MS } from "@cwf/core/constants";
import type { DeckCard } from "@cwf/core/games";
import { secToMs } from "@cwf/core/units";
import { useCallback } from "react";
import { StaleTick } from "@/components/states";
import { usd2 } from "@/features/markets/units";

/** A feed price on the 1e-8 print scale, as Mitoshi's one formatter reads it. */
const priceLine = (raw: bigint, decimals: number) => usd2(decimals <= 8 ? raw * 10n ** BigInt(8 - decimals) : raw / 10n ** BigInt(decimals - 8));
import { useMarketSession } from "@/features/markets/session/useMarketSession";
import { booleanCodec, usePersistedState } from "@/lib/persisted";
import { GAMES } from "../copy";
import { StageFace } from "../stage/StageFace";
import { SwipeDeck, type DeckPlace } from "../stage/SwipeDeck";
import { PRACTICE } from "./copy";
import { PracticeResult } from "./PracticeResult";
import { PracticeWatch } from "./PracticeWatch";
import { PriceProbe } from "./PriceProbe";
import { usePracticeRound } from "./usePracticeRound";
import "./practice.css";

/**
 * `/games/practice` — the duel's motion with nothing at risk.
 *
 * The whole mode is the shared `SwipeDeck` over a face that shows one real number, plus the sentence
 * that keeps it honest: practice scores on the live feed after a short watch, not on the Window's
 * settlement. That sentence is on screen at all times rather than in the first-run panel, because a
 * returning player never sees the panel again and the claim has to survive that.
 *
 * Nothing here reads a wallet, and nothing here can write one: `economicKindOf("practice")` is
 * `none` and there is no submitter in this file to disagree with it.
 */

const TUTORIAL_KEY = "owarine.games.practiceSeen";

export function PracticeStage() {
  const session = usePracticeRound();
  const market = useMarketSession();
  const [seen, setSeen, hydrated] = usePersistedState(TUTORIAL_KEY, false, booleanCodec);
  const { readiness, round, score } = session;

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
          eyebrow={PRACTICE.card.eyebrow(card.asset)}
          question={PRACTICE.card.question}
          pills={[
            {
              label: PRACTICE.card.live,
              value: price ? (
                <>
                  {priceLine(price.priceRaw, price.decimals)}
                  {aged && <StaleTick asOfMs={secToMs(price.blockTimestampSec)} reason="aged" compact />}
                </>
              ) : (
                <span className="st-question-pending">{PRACTICE.card.noPrice}</span>
              ),
              tone: "live",
            },
            { label: PRACTICE.card.stake, value: PRACTICE.card.noStake },
          ]}
        />
      );
    },
    [session],
  );

  return (
    <div className="container gm-page">
      {session.assets.map((asset) => (
        <PriceProbe key={asset} asset={asset} onPrice={session.reportPrice} />
      ))}

      <header className="pr-head">
        <span className="gm-eyebrow">{PRACTICE.eyebrow}</span>
        <h1 className="pr-title">
          {PRACTICE.title}
          <span className="accent">.</span>
        </h1>
      </header>

      <div className="pr-layout">
        <div>
          {readiness.kind === "ready" ? (
            score ? (
              <PracticeResult round={round} score={score} onAgain={session.deal} />
            ) : round.phase === "watching" ? (
              <PracticeWatch round={round} leftSec={session.watchLeftSec} priceOf={session.priceOf} />
            ) : (
              <SwipeDeck
                cards={round.cards}
                active={session.active}
                playedSide={session.playedSide}
                onPick={session.pick}
                refusal={session.active && !session.priceOf(session.active.asset) ? PRACTICE.card.noPrice : null}
                renderFace={renderFace}
              />
            )
          ) : (
            <Plate readiness={readiness.kind} closedLabel={market && !market.open ? market.label : null} />
          )}
        </div>

        <aside className="pr-layout-side">
          <p className="pr-intro">{PRACTICE.intro}</p>

          <div className="pr-note">
            <span className="pr-note-k">{PRACTICE.scoring.label}</span>
            <p className="pr-note-body">{PRACTICE.scoring.body}</p>
          </div>

          {hydrated && !seen && (
            <div className="pr-tutorial">
              <p className="pr-tutorial-title">{PRACTICE.tutorial.title}</p>
              <ol className="pr-tutorial-list">
                {PRACTICE.tutorial.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="pr-actions">
                <button type="button" className="pr-link" onClick={() => setSeen(true)}>
                  {PRACTICE.tutorial.dismiss}
                </button>
              </div>
            </div>
          )}

          <div className="pr-actions">
            <button type="button" className="pr-link" onClick={session.deal} disabled={readiness.kind !== "ready"}>
              {PRACTICE.restart}
            </button>
            {hydrated && seen && (
              <button type="button" className="pr-link pr-link--quiet" onClick={() => setSeen(false)}>
                {PRACTICE.tutorial.reopen}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Dealing, nothing dealable, or the venue unreadable — three different sentences, never merged. */
function Plate({ readiness, closedLabel }: { readiness: "dealing" | "no-deck" | "unreadable"; closedLabel: string | null }) {
  if (readiness === "dealing") {
    return (
      <div className="gm-plate">
        <p className="gm-plate-body">{PRACTICE.deal.dealing}</p>
      </div>
    );
  }
  const copy = readiness === "no-deck" ? PRACTICE.deal.none : PRACTICE.deal.offline;
  return (
    <div className="gm-plate">
      <p className="gm-plate-title">{copy.title}</p>
      <p className="gm-plate-body">{readiness === "no-deck" && closedLabel !== null ? PRACTICE.deal.none.closedBody(closedLabel) : copy.body}</p>
      <p className="gm-plate-meta">{GAMES.card.waitingOn("the venue's live Window list")}</p>
    </div>
  );
}
