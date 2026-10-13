"use client";
/**
 * The ticker hub's live parts — Ported from Owarine 90a91d71:web/src/features/ticker-hub/TickerHubScreen.tsx on
 * Mitoshi's data (P5, D-224; R4-10, D-227). The session chip reads the lanes: a coin and a stock with a 24/7 Window
 * trading say so (the owner's "stocks say closed while their 24/7 price moves"); a stock without one shows NYSE's hours.
 * The facts bar: the spot rolling on the Odometer beside a six-hour sparkline, the next report (a stock), the Mirror token
 * where S15 minted one, and the source with Bridge (R4-12) and Reserves. Then 01 its Windows (the lane cards), 02 Calls (fills and takes),
 * 03 Headlines. Nothing invented: every figure is a read.
 */
import { TICKERS, type LaneSet, type TickerSymbol } from "@cwf/core";
import { phase } from "@cwf/core/lifecycle";
import { addressUrl } from "@cwf/core/urls";
import { deploymentOf } from "@cwf/markets";
import { useLanes, usePriceHistory } from "@cwf/markets/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Odometer, SectionHeader } from "@/components/kit";
import { Hash } from "@/components/data";
import { LoadingState } from "@/components/states";
import { Sparkline } from "@/components/ui/sparkline";
import { tickerMarkets } from "@/features/markets/data/lane-view";
import { useTopsOfBook } from "@/features/markets/data/useTopOfBook";
import { MarketCard } from "@/features/markets/lanes/MarketCard";
import { MarketSessionChip } from "@/features/markets/session/MarketSessionChip";
import { usd2 } from "@/features/markets/units";
import { NEWS, timeAgo } from "@/features/news/copy";
import { articleSymbols, Cashtags, MarkCluster, NewsRow } from "@/features/news/NewsRow";
import { useCommittedSpot } from "@/features/terminal/live";
import { RoomDrawer } from "@/features/terminal/ui/RoomDrawer";
import { useClockValue } from "@/lib/clock";
import { closeDrawer, openDrawer, useOpenDrawerName } from "@/lib/drawer-param";
import { webEnv } from "@/lib/env";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { STOCKS } from "./copy";
import { HubCalls } from "./HubCalls";
import type { StockHubProps } from "./StockHubPage";
import { useNextReport } from "./useNextReport";

const WINDOWS = 6;
const CARD_BOOK_POLL_MS = 15_000;
const SPARK_BUCKET_SEC = 300;
const SPARK_SPAN_SEC = 6 * 3600;

const live = (nowMs: number, m: Parameters<typeof phase>[0]) => {
  const p = phase(m, nowMs);
  return p === "trading" || p === "upcoming" || p === "pendingOpeningPrint";
};

/** True when a 24/7 stock lane has a Window trading or about to for this ticker — its price moves off-hours. */
function trades24(set: LaneSet | null, symbol: string, nowMs: number): boolean {
  if (!set || nowMs === 0) return false;
  return set.lanes.some((lane) => lane.basis === "stock24" && tickerMarkets(lane, symbol).some((m) => live(nowMs, m)));
}

function useBasis(symbol: TickerSymbol) {
  const lanes = useLanes();
  const nowMs = useClockValue((ms) => Math.floor(ms / 10_000) * 10_000);
  return TICKERS[symbol].kind === "crypto" ? "crypto24" : trades24(lanes?.ok ? lanes.value : null, symbol, nowMs) ? "stock24" : "regular";
}

export function HubSessionChip({ symbol }: { symbol: TickerSymbol }) {
  const basis = useBasis(symbol);
  return <MarketSessionChip asset={symbol} basis={basis} />;
}

function Spark({ symbol, feed }: { symbol: string; feed: string }) {
  const bucket = useClockValue((ms) => Math.floor(ms / 1000 / SPARK_BUCKET_SEC));
  const toSec = bucket * SPARK_BUCKET_SEC;
  const history = usePriceHistory(bucket === 0 ? null : feed, toSec - SPARK_SPAN_SEC, toSec);
  const points = useMemo(() => (history?.ok ? history.value.map((p) => ({ tSec: p.blockTimestampSec, priceE8: p.priceRaw })) : []), [history]);
  if (points.length < 2) return null;
  const time = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
  return <Sparkline points={points} baselineE8={null} format={usd2} formatTime={time} label={STOCKS.sparkLabel(symbol)} className="stk-spark" />;
}

export function HubFacts({ symbol }: { symbol: TickerSymbol }) {
  const ticker = TICKERS[symbol];
  const stock = ticker.kind === "stock";
  const basis = useBasis(symbol);
  const spot = useCommittedSpot(symbol);
  const report = useNextReport(symbol);
  const mirror = stock ? (deploymentOf("stocks", TEMPO_CHAIN_ID)?.[`Mirror${symbol}`]?.address ?? null) : null;
  return (
    <div className="stk-facts">
      <dl className="stk-stats">
        <div className="stk-stat">
          <dt>{spot.priceE8 !== null && spot.stale ? `${STOCKS.spot} · ${STOCKS.spotStale}` : STOCKS.spot}</dt>
          <dd className="stk-spot numbers">
            {spot.price !== null ? <Odometer value={spot.price} kind="usd" /> : STOCKS.dash}
            <Spark symbol={symbol} feed={basis === "stock24" ? `${symbol}-24` : symbol} />
          </dd>
        </div>
        {stock && (
          <div className="stk-stat stk-stat-long">
            <dt>{STOCKS.report}</dt>
            <dd>{report.text}</dd>
          </div>
        )}
        {mirror && (
          <div className="stk-stat stk-stat-long">
            <dt>{STOCKS.token}</dt>
            <dd>
              <Hash value={mirror} href={addressUrl(mirror, webEnv.markets.network)} lead={6} tail={4} className="numbers" />
            </dd>
          </div>
        )}
      </dl>
      <p className="stk-source">
        {ticker.redstoneFeedId ? STOCKS.source : STOCKS.noSource}
        {mirror && (
          <>
            {" · "}
            <Link href={`/bridge?t=${symbol}`} className="stk-link">{STOCKS.bridge}</Link>
          </>
        )}
        {stock && (
          <>
            {" · "}
            <Link href="/reserves" className="stk-link">{STOCKS.reserves}</Link>
          </>
        )}
      </p>
    </div>
  );
}

/** The ticker's Windows trading or about to, soonest first — the lane page's own cards, from its one lane read. */
function Windows({ symbol }: { symbol: TickerSymbol }) {
  const lanes = useLanes();
  const router = useRouter();
  const tick = useClockValue((ms) => Math.floor(ms / 10_000));
  const markets = useMemo(() => {
    const set = lanes?.ok ? lanes.value : null;
    if (!set || tick === 0) return [];
    return set.lanes
      .flatMap((lane) => tickerMarkets(lane, symbol))
      .filter((m) => live(tick * 10_000, m))
      .sort((a, b) => a.tradingStartSec - b.tradingStartSec)
      .slice(0, WINDOWS);
  }, [lanes, symbol, tick]);
  const tops = useTopsOfBook(markets, CARD_BOOK_POLL_MS);
  // Before the lanes answer, and before the chain clock's first tick (no phase can be read yet), it is reading — never "none".
  if (lanes === null || tick === 0) return <LoadingState shape="cards" />;
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

function Headlines({ symbol, articles, headlinesOff, readAtMs }: Pick<StockHubProps, "symbol" | "articles" | "headlinesOff" | "readAtMs">) {
  if (articles === null) return <p className="stk-quiet" role="status">{headlinesOff ? STOCKS.headlines.off : STOCKS.headlines.quiet}</p>;
  if (articles.length === 0) return <p className="stk-quiet">{STOCKS.headlines.empty}</p>;
  return (
    <ol className="news-wire">
      {articles.map((a, i) => {
        const symbols = articleSymbols(a.symbols.length ? a.symbols : [symbol]);
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
  );
}

export function HubBody({ symbol, articles, headlinesOff, calls, readAtMs }: StockHubProps) {
  // The Room lives in the URL (`?d=room`, D-190; R4-2, D-227): Back closes it instead of leaving the hub.
  const room = useOpenDrawerName() === "room";
  const crypto = TICKERS[symbol].kind === "crypto";
  return (
    <>
      <section className="stk-section" aria-label={STOCKS.windows.title}>
        <SectionHeader index={STOCKS.windows.number} title={STOCKS.windows.title} />
        <Windows symbol={symbol} />
      </section>

      <section className="stk-section" aria-label={STOCKS.calls.title}>
        <SectionHeader index={STOCKS.calls.number} title={STOCKS.calls.title} desc={STOCKS.calls.desc} />
        <HubCalls symbol={symbol} calls={calls} />
      </section>

      <section className="stk-section" aria-label={STOCKS.headlines.title}>
        <SectionHeader index={STOCKS.headlines.number} title={STOCKS.headlines.title} eyebrow={crypto ? STOCKS.headlines.creditCrypto : STOCKS.headlines.credit} />
        <Headlines symbol={symbol} articles={articles} headlinesOff={headlinesOff} readAtMs={readAtMs} />
      </section>

      <RoomDrawer open={room} onOpenChange={(o) => (o ? openDrawer("room") : closeDrawer())} symbol={symbol} window={null} />
    </>
  );
}
