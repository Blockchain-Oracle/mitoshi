"use client";
/**
 * /stocks/[SYMBOL] (P5, D-224): Owarine 90a91d71 `ticker-hub/TickerHubScreen.tsx` on Mitoshi's data — the eyebrow and
 * session chip, the mark and the name, one line, the facts bar (spot, next report, the signed source), the ticker's
 * Room and Trade it; then 01 its live Windows (the lane cards, additive: Owarine's stock hub lists none), 02 the
 * headlines Finnhub files under it, 03 the token on Tempo — the Mirror token where one exists, and the one true line
 * on why buy and sell wait (no bridged supply on Moderato). Nothing invented.
 */
import { TICKERS, type StockSymbol } from "@cwf/core";
import { phase } from "@cwf/core/lifecycle";
import { addressUrl } from "@cwf/core/urls";
import { deploymentOf } from "@cwf/markets";
import { useLanes } from "@cwf/markets/react";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Hash } from "@/components/data";
import SectionHead from "@/components/shell/SectionHead";
import { tickerMarkets } from "@/features/markets/data/lane-view";
import { useTopsOfBook } from "@/features/markets/data/useTopOfBook";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { MarketCard } from "@/features/markets/lanes/MarketCard";
import { MarketSessionChip } from "@/features/markets/session/MarketSessionChip";
import { usd2 } from "@/features/markets/units";
import type { Article } from "@/features/news/wire";
import { NEWS, timeAgo } from "@/features/news/copy";
import { articleSymbols, Cashtags, MarkCluster, NewsRow } from "@/features/news/NewsRow";
import { useCommittedSpot } from "@/features/terminal/live";
import { RoomDrawer } from "@/features/terminal/ui/RoomDrawer";
import { useClockValue } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { STOCKS } from "./copy";
import { useNextReport } from "./useNextReport";
import "@/styles/market-card.css";
import "@/styles/news.css";
import "@/styles/news-wire.css";
import "./stocks.css";

const WINDOWS = 6;
const CARD_BOOK_POLL_MS = 15_000;

export interface StockHubProps {
  symbol: StockSymbol;
  /** The ticker's headlines from the server's Finnhub read; null when the wire couldn't be read. */
  articles: Article[] | null;
  /** No Finnhub key on this deployment: the section says so instead of showing nothing. */
  headlinesOff: boolean;
  readAtMs: number;
}

/** The ticker's Windows trading or about to, soonest first — the lane page's own cards, from its one lane read. */
function Windows({ symbol }: { symbol: StockSymbol }) {
  const lanes = useLanes();
  const router = useRouter();
  const tick = useClockValue((ms) => Math.floor(ms / 10_000));
  const markets = useMemo(() => {
    const set = lanes?.ok ? lanes.value : null;
    if (!set || tick === 0) return [];
    const nowMs = tick * 10_000;
    return set.lanes
      .flatMap((lane) => tickerMarkets(lane, symbol))
      .filter((m) => {
        const p = phase(m, nowMs);
        return p === "trading" || p === "upcoming" || p === "pendingOpeningPrint";
      })
      .sort((a, b) => a.tradingStartSec - b.tradingStartSec)
      .slice(0, WINDOWS);
  }, [lanes, symbol, tick]);
  const tops = useTopsOfBook(markets, CARD_BOOK_POLL_MS);
  // Before the lanes answer, and before the chain clock's first tick (no phase can be read yet), it is reading — never "none".
  if (lanes === null || tick === 0) return <p className="stk-quiet" role="status">{STOCKS.windows.reading}</p>;
  if (markets.length === 0) return <p className="stk-quiet">{STOCKS.windows.empty}</p>;
  return (
    <ul className="stk-windows">
      {markets.map((market, i) => (
        <li key={market.marketId}>
          <MarketCard market={market} selected={false} onSelect={(id) => router.push(`/markets/${id}`)} upCents={tops[i]?.upCents ?? null} downCents={tops[i]?.downCents ?? null} hydrating={tops[i]?.hydrating ?? true} />
        </li>
      ))}
    </ul>
  );
}

/** The stock's token on Tempo: the Mirror token's address where S15 minted one, and the one true line on trading it. */
function TokenCard({ symbol }: { symbol: StockSymbol }) {
  const mirror = deploymentOf("stocks", TEMPO_CHAIN_ID)?.[`Mirror${symbol}`]?.address ?? null;
  return (
    <div className="stk-token">
      {mirror ? (
        <>
          <p className="stk-token-row">
            <span>{STOCKS.token.mirror}</span>
            <Hash value={mirror} href={addressUrl(mirror, webEnv.markets.network)} lead={6} tail={4} className="numbers" />
          </p>
          <p className="stk-quiet">{STOCKS.token.blocked}</p>
        </>
      ) : (
        <p className="stk-quiet">{STOCKS.token.none}</p>
      )}
      <Link href="/reserves" className="stk-link">{STOCKS.token.reserves}</Link>
    </div>
  );
}

export function StockHubScreen({ symbol, articles, headlinesOff, readAtMs }: StockHubProps) {
  const ticker = TICKERS[symbol];
  const spot = useCommittedSpot(symbol);
  const report = useNextReport(symbol);
  const [room, setRoom] = useState(false);
  const price = spot.priceE8 !== null ? usd2(spot.priceE8) : STOCKS.dash;
  return (
    <div className="container stk-page stk-hub">
      <div className="stk-live">
        <span className="stk-eyebrow">{STOCKS.eyebrow}</span>
        <MarketSessionChip asset={symbol} basis="regular" />
      </div>
      <h1 className="stk-h1">
        <AssetDisc asset={symbol} className="stk-mark" />
        <span>
          {ticker.name} <span className="stk-sym numbers">${symbol}</span>
        </span>
      </h1>
      <p className="stk-intro">{STOCKS.intro(ticker.name)}</p>

      <div className="stk-bar">
        <dl className="stk-stats">
          <div className="stk-stat">
            <dt>{spot.priceE8 !== null && spot.stale ? `${STOCKS.spot} · ${STOCKS.spotStale}` : STOCKS.spot}</dt>
            <dd className="numbers">{price}</dd>
          </div>
          <div className="stk-stat">
            <dt>{STOCKS.report}</dt>
            <dd>{report.text}</dd>
          </div>
        </dl>
        <p className="stk-source">{ticker.redstoneFeedId ? STOCKS.source : STOCKS.noSource}</p>
        <div className="stk-actions">
          <button type="button" className="stk-room" onClick={() => setRoom(true)}>
            <MessageCircle aria-hidden className="size-4" />
            {STOCKS.room(symbol)}
            <span className="stk-room-meta">{STOCKS.roomQualifier}</span>
          </button>
          <Link href={`/trade/${symbol}`} className="stk-trade">{STOCKS.trade}</Link>
        </div>
      </div>

      <section className="stk-section" aria-label={STOCKS.windows.title}>
        <SectionHead number={STOCKS.windows.number} title={STOCKS.windows.title} />
        <Windows symbol={symbol} />
      </section>

      <section className="stk-section" aria-label={STOCKS.headlines.title}>
        <SectionHead number={STOCKS.headlines.number} title={STOCKS.headlines.title} meta={STOCKS.headlines.credit} />
        {articles === null ? (
          <p className="stk-quiet" role="status">{headlinesOff ? STOCKS.headlines.off : STOCKS.headlines.quiet}</p>
        ) : articles.length === 0 ? (
          <p className="stk-quiet">{STOCKS.headlines.empty}</p>
        ) : (
          <ol className="news-wire">
            {articles.map((a, i) => {
              const symbols = articleSymbols(a.symbols);
              return (
                <NewsRow
                  key={a.url}
                  index={i + 1}
                  title={a.title}
                  href={a.url}
                  mark={<MarkCluster symbols={symbols} />}
                  meta={
                    <>
                      <span className="news-meta">{timeAgo(a.publishedAtSec, readAtMs)} · {a.source}</span>
                      <Cashtags symbols={symbols} />
                    </>
                  }
                  tone={a.sentiment}
                  toneWord={NEWS.sentiment[a.sentiment]}
                />
              );
            })}
          </ol>
        )}
      </section>

      <section className="stk-section" aria-label={STOCKS.token.title}>
        <SectionHead number={STOCKS.token.number} title={STOCKS.token.title} />
        <TokenCard symbol={symbol} />
      </section>

      <RoomDrawer open={room} onOpenChange={setRoom} symbol={symbol} window={null} />
    </div>
  );
}
