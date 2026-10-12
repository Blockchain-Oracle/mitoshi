// `/news` (S5, L-17; Owarine's page since D-226): the wire — Finnhub's market and company news for the listed stocks,
// Cointelegraph and Decrypt for the coins — read at request time (`features/news`), in the app shell. `?symbol=TSLA`
// narrows the head and the wire (the ticker hub and cashtags link here).
import { isTickerSymbol } from "@cwf/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NEWS } from "@/features/news/copy";
import { NewsFeed, NewsHead, NewsSkeleton } from "@/features/news/NewsScreen";
import "@/styles/news.css";
import "@/styles/news-wire.css";

export const metadata: Metadata = { title: "News", description: "The stories on the coins and stocks Mitoshi lists, newest first." };

async function Narrowed({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  const raw = (await searchParams).symbol?.toUpperCase() ?? null;
  const symbol = raw && isTickerSymbol(raw) ? raw : null;
  return (
    <>
      <NewsHead symbol={symbol} />
      <NewsFeed symbol={symbol} />
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  return (
    <div className="container news-page">
      <div className="news-inner">
        <div className="news-live">
          <span className="news-live-dot" aria-hidden />
          <span className="news-live-label">{NEWS.live}</span>
        </div>
        <Suspense
          fallback={
            <>
              <NewsHead symbol={null} />
              <NewsSkeleton />
            </>
          }
        >
          <Narrowed searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
