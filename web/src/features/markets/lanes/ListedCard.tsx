"use client";
/**
 * A Window listed for the next open (Ported from Owarine 90a91d71:web/src/features/markets/lanes/ListedCard.tsx, R4-3
 * D-227): the reference's between-rounds slot (`.market-card.market-card-pending`, yosuku part-06) — the head says when
 * it opens, the body what a call here does, and the strip is the one action, "Schedule a call · your price", which
 * opens the ticket in schedule mode (D-088). "Schedule a call" once, the time once.
 */
import type { EventMarket, MarketId } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { formatWallClock } from "@cwf/core/units";
import { LANE_CARD } from "../copy";
import { AssetDisc } from "../hero/AssetDisc";

export function ListedCard({ market, selected, onSelect }: { market: EventMarket; selected: boolean; onSelect: (marketId: MarketId) => void }) {
  const open = () => onSelect(market.marketId);
  return (
    <article
      className="market-card market-card-pending"
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      aria-label={LANE_CARD.listedAria(market.asset)}
      data-lane={market.lane}
      onClick={open}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
    >
      <div className="mc-head">
        <span className="mc-asset">
          <AssetDisc asset={market.asset} className="glyph" />
          <span className="mc-ticker">{market.asset}</span>
          <span className="mc-cadence">{formatCadence(market.intervalSec)}</span>
        </span>
        <span className="mc-countdown">
          <span className="clock-dot" aria-hidden />
          {LANE_CARD.opensAt(formatWallClock(market.tradingStartSec * 1000))}
        </span>
      </div>
      <div className="mc-pending">
        <span className="mc-pending-dot" aria-hidden />
        <p className="mc-pending-copy">
          <strong>{LANE_CARD.listedHeadline}</strong>
        </p>
      </div>
      <button
        type="button"
        className="mc-room"
        onClick={(event) => {
          event.stopPropagation();
          open();
        }}
      >
        <span className="mc-room-label">{LANE_CARD.scheduleCta}</span>
        <span className="mc-room-hint">{LANE_CARD.scheduleMeta}</span>
      </button>
    </article>
  );
}
