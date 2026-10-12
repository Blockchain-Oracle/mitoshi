// /tickers/<SYMBOL> (P5, D-224; Owarine's route since D-226, which retired /stocks) — one spelling (upper case; any other case redirects to it), an unlisted symbol is a real
// 404. The ticker's headlines are read here at request time from Finnhub's company wire (`/news`'s own source), so
// the island opens with them; prices, the session and the Windows stream in client-side.
import { isStockSymbol, TICKERS } from "@cwf/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { merge } from "@/features/news/wire";
import { StockHubPage } from "@/features/stocks/StockHubPage";
import { companyNews, finnhubConfigured } from "@/server/finnhub";

interface Props {
  params: Promise<{ symbol: string }>;
}

const HEADLINES = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const upper = (await params).symbol.toUpperCase();
  return { title: isStockSymbol(upper) ? `${TICKERS[upper].name} (${upper})` : undefined };
}

export default async function StockPage({ params }: Props) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  if (!isStockSymbol(upper)) notFound();
  if (symbol !== upper) redirect(`/tickers/${upper}`);
  await connection();
  const headlinesOff = !finnhubConfigured();
  const feed = headlinesOff ? null : await companyNews(upper);
  const articles = feed === null ? null : merge([feed], HEADLINES);
  return <StockHubPage symbol={upper} articles={articles} headlinesOff={headlinesOff} readAtMs={Date.now()} />;
}
