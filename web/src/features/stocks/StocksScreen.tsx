"use client";
/**
 * /stocks (P5, D-224): the ten listed stocks as tiles — Owarine 90a91d71 `lanes/ClosedStocks.tsx`'s row anatomy
 * (mark, name, price) with the session chip and the next report. Each opens its hub. The spot is the shell's one price
 * stream; the session and the calendar are the store ops feeds; nothing here adds a chain read.
 */
import { STOCK_SYMBOLS, TICKERS, type StockSymbol } from "@cwf/core";
import Link from "next/link";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { MarketSessionChip } from "@/features/markets/session/MarketSessionChip";
import { usd2 } from "@/features/markets/units";
import { useCommittedSpot } from "@/features/terminal/live";
import { STOCKS } from "./copy";
import { useNextReport } from "./useNextReport";
import "./stocks.css";

function Tile({ symbol }: { symbol: StockSymbol }) {
  const ticker = TICKERS[symbol];
  const spot = useCommittedSpot(symbol, { seed: false });
  const report = useNextReport(symbol);
  return (
    <li>
      <Link href={`/stocks/${symbol}`} className="stk-tile">
        <AssetDisc asset={symbol} className="stk-tile-mark" />
        <span className="stk-tile-body">
          <span className="stk-tile-name">{ticker.name}</span>
          <span className="stk-tile-meta">
            <span className="numbers">${symbol}</span>
            {report.known ? <span>{STOCKS.report} {report.text}</span> : null}
          </span>
        </span>
        <span className="stk-tile-right">
          <span className="numbers stk-tile-price">{spot.priceE8 !== null ? usd2(spot.priceE8) : STOCKS.dash}</span>
          <MarketSessionChip asset={symbol} basis="regular" className="stk-tile-chip" />
        </span>
      </Link>
    </li>
  );
}

export function StocksScreen() {
  return (
    <div className="container stk-page">
      <h1 className="stk-title">{STOCKS.title}</h1>
      <ul className="stk-grid" aria-label={STOCKS.title}>
        {STOCK_SYMBOLS.map((symbol) => (
          <Tile key={symbol} symbol={symbol} />
        ))}
      </ul>
    </div>
  );
}
