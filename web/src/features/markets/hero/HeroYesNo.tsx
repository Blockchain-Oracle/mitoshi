"use client";
/**
 * The call, on a phone (Ported from Owarine 90a91d71:web/src/features/markets/hero/HeroYesNo.tsx, R4-3 D-227): below
 * `lg` the ticket rail is gone and these two buttons are the way into it — tapping one is the choice; it selects the
 * side, which opens the ticket drawer. They stick above the dock while the hero is on screen (`.page-action`, R4-2).
 * D-230: a side with nothing to take read a bare "UP —" — now one line under the pair says why, live: the Window is
 * waiting for its opening price (when it opened, the count), or the book is empty (the house quotes within seconds of
 * the open; late in a Window, when the next opens). A book not read yet says nothing, and a read that failed says the
 * app can't read it (retrying) — "no offers" only on a read that answered with an empty side. The count ticks outside
 * the live region's announcement (`CountedText`).
 */
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { noEntryCutoffSec } from "@cwf/core/lifecycle";
import { useOpeningPrice } from "@cwf/markets/react";
import { useClockValue } from "@/lib/clock";
import { HERO_HEAD, LANE_CARD, MARKETS } from "../copy";
import { bookNote, openingWaitLine } from "../data/opening-wait";
import type { TopOfBook } from "../data/useTopOfBook";
import { usePrintsState } from "../session";
import { CountedText } from "../session/CountedText";

interface HeroYesNoProps {
  market: EventMarket;
  openingRaw: bigint | null;
  book: TopOfBook;
  onSelect: (marketId: MarketId, side: Side) => void;
}

/** A side's price: the cents, a loading mark before the book's first answer, else "—" (the note says why). */
const priceOf = (cents: number | null, hydrating: boolean) => (cents === null ? (hydrating ? LANE_CARD.priceLoading : HERO_HEAD.noPrice) : `${cents}¢`);

export function HeroYesNo({ market, openingRaw, book, onSelect }: HeroYesNoProps) {
  const { upCents, downCents, hydrating, failed } = book;
  const price = (cents: number | null) => priceOf(cents, hydrating);
  const prints = usePrintsState();
  // The chain didn't answer the opening read (a rate-limited RPC): say so, never "waiting" over a trading Window.
  const opening = useOpeningPrice(market.marketId);
  const unread = opening !== null && !opening.ok && openingRaw === null;
  const empty = upCents === null || downCents === null;
  // Re-derived each second, rendered on change: the wait counts, an empty book's words hold still.
  const note = useClockValue((ms) => {
    const nowSec = Math.floor(ms / 1000);
    if (ms === 0 || market.state !== "open" || nowSec < market.tradingStartSec || nowSec >= noEntryCutoffSec(market)) return null;
    if (openingRaw === null) return openingWaitLine({ startSec: market.tradingStartSec, nowSec, prints, unread });
    return empty ? bookNote({ hydrating, failed }, market, nowSec) : null;
  });
  return (
    <div className="hero-yesno page-action" data-primary-action="">
      <button type="button" className="hyn hyn-yes" aria-label={`${HERO_HEAD.betUp} · ${price(upCents)}`} aria-describedby={note ? "hyn-note" : undefined} onClick={() => onSelect(market.marketId, "up")}>
        <span className="hyn-label">{MARKETS.up}</span>
        <span className="hyn-price">{price(upCents)}</span>
      </button>
      <button type="button" className="hyn hyn-no" aria-label={`${HERO_HEAD.betDown} · ${price(downCents)}`} aria-describedby={note ? "hyn-note" : undefined} onClick={() => onSelect(market.marketId, "down")}>
        <span className="hyn-label">{MARKETS.down}</span>
        <span className="hyn-price">{price(downCents)}</span>
      </button>
      {note ? (
        <p id="hyn-note" role="status" className="hyn-note">
          <CountedText text={note} />
        </p>
      ) : null}
    </div>
  );
}
