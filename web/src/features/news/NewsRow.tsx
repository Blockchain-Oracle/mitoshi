// Ported from Owarine 90a91d71:web/src/features/news/NewsRow.tsx (D-226) — one wire row in the grammar every feed
// shares (D-082, V1 "Ledger"): `index · mark slot · body · tone · arrow`, a 2 px edge in the tone's ink down the left.
// The title is the row's only link, so cashtags can link to their hubs. Columns live in `styles/news-wire.css`.
import { isTickerSymbol, type TickerSymbol } from "@cwf/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { tickerHref } from "@/lib/ticker-href";
import type { Sentiment } from "./wire";

/** The most marks and cashtags one row carries. */
export const ROW_SYMBOLS_MAX = 4;

/** The registry tickers a story is filed under, in the wire's order, without repeats. */
export function articleSymbols(symbols: readonly string[] | undefined): TickerSymbol[] {
  return [...new Set((symbols ?? []).filter(isTickerSymbol))].slice(0, ROW_SYMBOLS_MAX);
}

/** The asset marks in a cluster, overlapping like a byline of faces. */
export function MarkCluster({ symbols, className }: { symbols: readonly string[]; className?: string }) {
  if (symbols.length === 0) return null;
  return (
    <span className={className ? `news-marks ${className}` : "news-marks"} aria-hidden>
      {symbols.map((symbol) => (
        <AssetDisc key={symbol} asset={symbol} className="news-mark" />
      ))}
    </span>
  );
}

/** `$TSLA $BTC` — each a mono link: a stock to its hub, a coin to its chart. */
export function Cashtags({ symbols }: { symbols: readonly TickerSymbol[] }) {
  if (symbols.length === 0) return null;
  return (
    <span className="news-cashtags">
      {symbols.map((symbol) => (
        <Link key={symbol} href={tickerHref(symbol)} className="news-cashtag">
          ${symbol}
        </Link>
      ))}
    </span>
  );
}

/** The sentiment as a dot and a word — a labelled tone, never a number. */
export function Tone({ tone, word }: { tone: Sentiment; word: string }) {
  return (
    <span className="news-tone" data-tone={tone}>
      <span className="news-tone-dot" aria-hidden />
      {word}
    </span>
  );
}

export interface NewsRowProps {
  /** 1-based; the lead is 01, so the wire starts at 02. */
  index: number;
  title: string;
  href: string;
  mark?: ReactNode;
  meta: ReactNode;
  tone: Sentiment;
  toneWord: string;
}

export function NewsRow({ index, title, href, mark, meta, tone, toneWord }: NewsRowProps) {
  return (
    <li className="news-row" data-tone={tone}>
      <span className="news-index">{String(index).padStart(2, "0")}</span>
      <span className="news-row-mark">{mark}</span>
      <span className="news-row-body">
        <a href={href} target="_blank" rel="noopener noreferrer" className="news-row-title">
          {title}
        </a>
        <span className="news-row-meta">{meta}</span>
      </span>
      <span className="news-row-tone">
        <Tone tone={tone} word={toneWord} />
      </span>
      <span className="news-row-arrow" aria-hidden>↗</span>
    </li>
  );
}
