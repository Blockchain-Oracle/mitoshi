// `/trade/[symbol]` (S23, D-192): the terminal — one screen, a live line, UP or DOWN in one tap. Prerendered per listed
// ticker; an unlisted symbol is a 404 that suggests the listed ones. The screen streams in client-side (D-050, D-071);
// the params are read inside Suspense so the shell paints at once (Next 16 instant navigation).
import { isTickerSymbol, TICKER_SYMBOLS, TICKERS } from "@cwf/core";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TerminalPage, TerminalPlaceholder } from "@/features/terminal/TerminalPage";

type Params = Promise<{ symbol: string }>;

export function generateStaticParams() {
  return TICKER_SYMBOLS.map((symbol) => ({ symbol }));
}

export async function generateMetadata({ params }: { params: Params }) {
  const { symbol } = await params;
  return { title: isTickerSymbol(symbol) ? `${TICKERS[symbol].name} (${symbol})` : "Trade" };
}

async function Terminal({ params }: { params: Params }) {
  const { symbol } = await params;
  if (!isTickerSymbol(symbol)) notFound();
  return <TerminalPage symbol={symbol} />;
}

export default function TradePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<TerminalPlaceholder symbol="" />}>
      <Terminal params={params} />
    </Suspense>
  );
}
