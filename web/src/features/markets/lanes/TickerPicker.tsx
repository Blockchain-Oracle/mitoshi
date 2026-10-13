"use client";
/**
 * Filters the active lane by ticker (Ported from Owarine 90a91d71:web/src/features/markets/lanes/TickerPicker.tsx, R4-3
 * D-227): the leaderboard's `.asset-tabs` / `.asset-tab` underline tabs — mono caps, the asset's disc, a vermilion
 * underline on the pinned one — "All" first. A ticker the roller has paused stays in place, a step quieter, its title
 * saying why. On the kit's ScrollRail (From 21st.dev 10484 moumensoliman/scroll-fade-effect, R4-2), so a phone sees an
 * edge fade where more tickers wait. The pin survives a cadence switch and a reload, and the hero follows it.
 */
import { ScrollRail } from "@/components/kit/ScrollRail";
import { cn } from "@/lib/utils";
import { MARKETS } from "../copy";
import { AssetDisc } from "../hero/AssetDisc";
import { pausedCopy } from "./paused";
import "./ticker-picker.css";
import "@/components/kit/kit.css";

interface TickerPickerProps {
  tickers: readonly string[];
  paused: ReadonlyMap<string, string>;
  intervalSec: number;
  ticker: string | null;
  onPick: (ticker: string | null) => void;
}

export function TickerPicker({ tickers, paused, intervalSec, ticker, onPick }: TickerPickerProps) {
  return (
    <ScrollRail label={MARKETS.tickerGroup} className="asset-tabs tkp">
      <button type="button" className={cn("asset-tab", ticker === null && "active")} aria-pressed={ticker === null} onClick={() => onPick(null)}>
        {MARKETS.allTickers}
      </button>
      {tickers.map((symbol) => {
        const state = paused.get(symbol);
        return (
          <button
            key={symbol}
            type="button"
            className={cn("asset-tab", ticker === symbol && "active")}
            aria-pressed={ticker === symbol}
            data-paused={state !== undefined}
            title={state === undefined ? undefined : pausedCopy(state, symbol, intervalSec).headline}
            onClick={() => onPick(symbol)}
          >
            <AssetDisc asset={symbol} className="glyph" />
            {symbol}
          </button>
        );
      })}
    </ScrollRail>
  );
}
