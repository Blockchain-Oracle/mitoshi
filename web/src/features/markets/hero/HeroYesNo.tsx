"use client";
/**
 * The call, on a phone (Ported from Owarine 90a91d71:web/src/features/markets/hero/HeroYesNo.tsx, R4-3 D-227): below
 * `lg` the ticket rail is gone and these two buttons are the way into it — tapping one is the choice; it selects the
 * side, which opens the ticket drawer. They stick above the dock while the hero is on screen (`.page-action`, R4-2).
 * D-230: a side with nothing to take read a bare "UP —" — now one line under the pair says why, live: the Window is
 * waiting for its opening price (when it opened, the count), or the book is empty (the house quotes within seconds of
 * the open; late in a Window, when the next opens).
 */
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { noEntryCutoffSec } from "@cwf/core/lifecycle";
import { useOpeningPrice } from "@cwf/markets/react";
import { useClockValue } from "@/lib/clock";
import { HERO_HEAD, MARKETS } from "../copy";
import { emptyBookWhy, openingWaitLine } from "../data/opening-wait";
import { usePrintsState } from "../session";

interface HeroYesNoProps {
  market: EventMarket;
  openingRaw: bigint | null;
  upCents: number | null;
  downCents: number | null;
  onSelect: (marketId: MarketId, side: Side) => void;
}

const price = (cents: number | null) => (cents === null ? HERO_HEAD.noPrice : `${cents}¢`);

export function HeroYesNo({ market, openingRaw, upCents, downCents, onSelect }: HeroYesNoProps) {
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
    return empty ? emptyBookWhy(market, nowSec).text : null;
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
          {note}
        </p>
      ) : null}
    </div>
  );
}
