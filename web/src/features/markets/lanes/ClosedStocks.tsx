"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/lanes/ClosedStocks.tsx (O-2, D-222) — "it doesn't mean our
// stocks should be empty" (the owner, 2026-10-08): while the US market is shut, each listed stock with nothing on the
// board still shows — its mark, its last display price and when it opens. Its 24/7 lane, if listed, is on the board.
import { isStalledOpening, phase } from "@cwf/core/lifecycle";
import { STOCK_SYMBOLS, TICKERS, type LaneSet, type StockSymbol } from "@cwf/core";
import { Lock } from "lucide-react";
import { useCommittedSpot } from "@/features/terminal/live";
import { useClockValue } from "@/lib/clock";
import { CLOSED } from "../copy";
import { AssetDisc } from "../hero/AssetDisc";
import { useMarketSession } from "../session";
import { usd2 } from "../units";

export function ClosedStocks({ laneSet }: { laneSet: LaneSet | null }) {
  const session = useMarketSession();
  const minute = useClockValue((ms) => Math.floor(ms / 60_000));
  if (!session || session.open || minute === 0) return null;
  const nowMs = minute * 60_000;
  const onBoard = new Set(
    (laneSet?.lanes ?? [])
      .flatMap((lane) => lane.markets)
      .filter((m) => {
        const p = phase(m, nowMs);
        return p === "trading" || p === "upcoming" || (p === "pendingOpeningPrint" && !isStalledOpening(m, nowMs));
      })
      .map((m) => m.asset),
  );
  const listed = new Set(Object.keys(session.lanes).map((key) => key.split("-")[0] ?? ""));
  const stocks = STOCK_SYMBOLS.filter((s) => listed.has(s) && !onBoard.has(s));
  if (stocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" aria-label={CLOSED.stocksTitle}>
      <p className="flex flex-wrap items-center gap-2 type-caption text-ink-secondary">
        <Lock aria-hidden className="size-4" />
        <span className="type-body-strong text-ink">{CLOSED.stocksTitle}</span>
        <span>{CLOSED.stocksLine(session.label)}</span>
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stocks.map((symbol) => (
          <li key={symbol} className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-3 py-3">
            <AssetDisc asset={symbol} className="closed-stock-mark" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate type-body-strong text-ink">{TICKERS[symbol].name}</span>
              <StockPrice symbol={symbol} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StockPrice({ symbol }: { symbol: StockSymbol }) {
  const spot = useCommittedSpot(symbol, { seed: false });
  return <span className="truncate type-caption text-ink-muted tabular-nums">{symbol} · {spot.priceE8 === null ? CLOSED.noPrice : usd2(spot.priceE8)}</span>;
}
