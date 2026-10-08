"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/sheets/MarketsSheet.tsx — a right-edge drawer
// (D-190): Crypto then Stocks, each row the live display price and the shortest Window the symbol trades on; a symbol
// with no Window says why (SPCX: no signed price source). Favourites, Hot and the 24 h change arrive with 23g.
import { CRYPTO_SYMBOLS, STOCK_SYMBOLS, TICKERS, type LaneSet, type TickerSymbol } from "@cwf/core";
import Link from "next/link";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { tapFeedback } from "@/lib/feedback";
import { formatPrice, priceDecimals } from "../chart/engine";
import { TERMINAL } from "../copy";
import { useCommittedSpot } from "../live";
import { lanesFor } from "../pick-window";

function Row({ symbol, current, lanes, onPick }: { symbol: TickerSymbol; current: boolean; lanes: string | null; onPick: (s: TickerSymbol) => void }) {
  const spot = useCommittedSpot(symbol, { seed: false });
  return (
    <button type="button" className="tm-market" aria-current={current ? "true" : undefined} onClick={() => (tapFeedback(), onPick(symbol))}>
      <AssetDisc asset={symbol} className="tm-disc" />
      <span className="tm-pos-main">
        <span className="tm-pos-title">{symbol} · {TICKERS[symbol].name}</span>
        <span className="tm-pos-meta">{lanes ?? (TICKERS[symbol].redstoneFeedId ? TERMINAL.picker.noLane : TERMINAL.noWindow.spcx)}</span>
      </span>
      <span className="tm-pos-figure">{spot.price === null ? "—" : `$${formatPrice(spot.price, priceDecimals(spot.price))}`}</span>
    </button>
  );
}

export function MarketsDrawer({ open, onOpenChange, symbol, set, nowSec, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; symbol: string; set: LaneSet | null; nowSec: number; onPick: (s: TickerSymbol) => void }) {
  const lanesOf = (s: TickerSymbol) => {
    const l = lanesFor(set, s, nowSec);
    return l.length ? l.map((x) => x.label).join(" · ") : null;
  };
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={TERMINAL.picker.title}>
        {open ? (
          <>
            <p className="tm-market-group">{TERMINAL.picker.crypto}</p>
            {CRYPTO_SYMBOLS.map((s) => <Row key={s} symbol={s} current={s === symbol} lanes={lanesOf(s)} onPick={onPick} />)}
            <p className="tm-market-group">{TERMINAL.picker.stocks}</p>
            {STOCK_SYMBOLS.map((s) => <Row key={s} symbol={s} current={s === symbol} lanes={lanesOf(s)} onPick={onPick} />)}
            <p className="tm-market-group">
              <Link href="/markets" className="underline decoration-dotted underline-offset-4">{TERMINAL.picker.all}</Link>
            </p>
          </>
        ) : null}
      </SlideOverContent>
    </SlideOver>
  );
}
