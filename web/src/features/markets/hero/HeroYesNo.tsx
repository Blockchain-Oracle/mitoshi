"use client";
/**
 * The call, on a phone (Ported from Owarine 90a91d71:web/src/features/markets/hero/HeroYesNo.tsx, R4-3 D-227): below
 * `lg` the ticket rail is gone and these two buttons are the way into it — tapping one is the choice; it selects the
 * side, which opens the ticket drawer. They stick above the dock while the hero is on screen (`.page-action`, R4-2).
 */
import type { MarketId, Side } from "@cwf/core";
import { HERO_HEAD, MARKETS } from "../copy";

interface HeroYesNoProps {
  marketId: MarketId;
  upCents: number | null;
  downCents: number | null;
  onSelect: (marketId: MarketId, side: Side) => void;
}

const price = (cents: number | null) => (cents === null ? HERO_HEAD.noPrice : `${cents}¢`);

export function HeroYesNo({ marketId, upCents, downCents, onSelect }: HeroYesNoProps) {
  return (
    <div className="hero-yesno page-action" data-primary-action="">
      <button type="button" className="hyn hyn-yes" aria-label={`${HERO_HEAD.betUp} · ${price(upCents)}`} onClick={() => onSelect(marketId, "up")}>
        <span className="hyn-label">{MARKETS.up}</span>
        <span className="hyn-price">{price(upCents)}</span>
      </button>
      <button type="button" className="hyn hyn-no" aria-label={`${HERO_HEAD.betDown} · ${price(downCents)}`} onClick={() => onSelect(marketId, "down")}>
        <span className="hyn-label">{MARKETS.down}</span>
        <span className="hyn-price">{price(downCents)}</span>
      </button>
    </div>
  );
}
