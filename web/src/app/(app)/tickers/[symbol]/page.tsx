// /tickers/<SYMBOL> (P5, D-224; Owarine's route since D-226) — Ported from Owarine 90a91d71:web/src/app/tickers/[symbol]/page.tsx
// (R4-10, D-227): every listed ticker, coins included, has a hub; one spelling, upper case. The proxy settles both
// before render (`tickerHubRoute`: another spelling redirects, an unlisted symbol is a 404 with status 404); the checks
// here only back it up. The head and Trade it paint from the server at once; the headlines and the ticker's
// newest calls are read here at request time; the price, the session and the Windows stream in on the client.
import { isTickerSymbol, TICKERS } from "@cwf/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { hubCalls, hubHeadlines } from "@/features/stocks/hub.server";
import { StockHubHead } from "@/features/stocks/StockHubHead";
import { StockHubPage } from "@/features/stocks/StockHubPage";
import { NOT_FOUND } from "@/lib/copy";
import { tickerHref } from "@/lib/ticker-href";

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const upper = (await params).symbol.toUpperCase();
  return { title: isTickerSymbol(upper) ? `${TICKERS[upper].name} (${upper})` : NOT_FOUND.pageTitle };
}

export default async function TickerPage({ params }: Props) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  if (!isTickerSymbol(upper)) notFound();
  if (symbol !== upper) redirect(tickerHref(upper));
  await connection();
  const [headlines, calls] = await Promise.all([hubHeadlines(upper), hubCalls(upper)]);
  return (
    <div className="container stk-page stk-hub">
      <StockHubHead symbol={upper} />
      <StockHubPage symbol={upper} articles={headlines.articles} headlinesOff={headlines.off} calls={calls} readAtMs={Date.now()} />
    </div>
  );
}
