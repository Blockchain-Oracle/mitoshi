// The ticker hub's head — Ported from Owarine 90a91d71:web/src/features/ticker-hub/TickerHubScreen.tsx (R4-10, D-227):
// the eyebrow and the session, the mark, the name and the accent `$SYM`, rendered on the server so they paint at once.
// No intro line: the head says it. The session chip is the one live piece (an island that waits for the data layer).
import { TICKERS, type TickerSymbol } from "@cwf/core";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { STOCKS } from "./copy";
import { HubSession } from "./StockHubPage";

export function StockHubHead({ symbol }: { symbol: TickerSymbol }) {
  const ticker = TICKERS[symbol];
  return (
    <>
      <div className="stk-live">
        <span className="stk-eyebrow">{STOCKS.eyebrow(ticker.kind)}</span>
        <HubSession symbol={symbol} />
      </div>
      <h1 className="stk-h1">
        <AssetDisc asset={symbol} className="stk-mark" />
        <span>
          {ticker.name} <span className="stk-sym numbers">${symbol}</span>
        </span>
      </h1>
    </>
  );
}
