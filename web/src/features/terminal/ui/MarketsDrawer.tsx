"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/sheets/MarketsSheet.tsx — a right-edge drawer
// (D-190): search, the tabs Favourites · All · Hot · Crypto · Stocks · 24/7, a star per row, the live display price
// and the day's change (`/prices/day`: a stock against its previous close, crypto over 24 h), the shortest Window the
// symbol trades on; a symbol with no Window says why (SPCX: no signed price source). "Events" opens the word board.
// Tradash's states (§8): price and change skeletons until the first tick and the day's figures, "Loading movers…" on
// Hot until they arrive, and its two empty lines.
import { CRYPTO_SYMBOLS, STOCK_SYMBOLS, TICKER_SYMBOLS, TICKERS, type LaneSet, type TickerSymbol } from "@cwf/core";
import { liveTick } from "@cwf/markets/live-ticks";
import { Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { tapFeedback } from "@/lib/feedback";
import { formatPrice, priceDecimals } from "../chart/engine";
import { TERMINAL } from "../copy";
import { dayChange, useDayStats, type DayFigures } from "../day-stats";
import { useCommittedSpot } from "../live";
import { lanesFor } from "../pick-window";
import { setTradeSettings, tradeSettings, useTradeSettings } from "../settings";

type Tab = "favourites" | "all" | "hot" | "crypto" | "stocks" | "allDay";
const TABS: Tab[] = ["favourites", "all", "hot", "crypto", "stocks", "allDay"];
const HOT_COUNT = 4;

function Row({ symbol, current, lanes, day, dayLoading, starred, onPick }: { symbol: TickerSymbol; current: boolean; lanes: string | null; day: DayFigures | undefined; dayLoading: boolean; starred: boolean; onPick: (s: TickerSymbol) => void }) {
  const spot = useCommittedSpot(symbol, { seed: false });
  const change = dayChange(spot.price, day);
  const toggleStar = () => {
    tapFeedback();
    const favs = new Set(tradeSettings().favourites);
    if (favs.has(symbol)) favs.delete(symbol);
    else favs.add(symbol);
    setTradeSettings({ favourites: [...favs] });
  };
  return (
    <div className="tm-market-row">
      <button type="button" className="tm-market" aria-current={current ? "true" : undefined} onClick={() => (tapFeedback(), onPick(symbol))}>
        <AssetDisc asset={symbol} className="tm-disc" />
        <span className="tm-pos-main">
          <span className="tm-pos-title">{symbol} · {TICKERS[symbol].name}</span>
          <span className="tm-pos-meta">{lanes ?? (TICKERS[symbol].redstoneFeedId ? TERMINAL.picker.noLane : TERMINAL.noWindow.spcx)}</span>
        </span>
        <span className="tm-pos-figure">
          {spot.price === null ? <span aria-hidden className="tm-skel" style={{ width: "4.5rem" }} /> : `$${formatPrice(spot.price, priceDecimals(spot.price))}`}
          {change !== null ? <span className={`tm-pos-pnl ${change >= 0 ? "is-up" : "is-down"}`}>{`${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(2)}%`}</span>
            : dayLoading || spot.price === null ? <span aria-hidden className="tm-skel" style={{ width: "3rem" }} /> : null}
        </span>
      </button>
      <button type="button" className={`tm-star${starred ? " is-on" : ""}`} aria-pressed={starred} aria-label={TERMINAL.picker.star(symbol)} onClick={toggleStar}>
        <Star aria-hidden />
      </button>
    </div>
  );
}

export function MarketsDrawer({ open, onOpenChange, symbol, set, nowSec, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; symbol: string; set: LaneSet | null; nowSec: number; onPick: (s: TickerSymbol) => void }) {
  const settings = useTradeSettings();
  const day = useDayStats(open);
  const [tab, setTab] = useState<Tab>(settings.favourites.length ? "favourites" : "all");
  const [query, setQuery] = useState("");
  const lanesOf = (s: TickerSymbol) => {
    const l = lanesFor(set, s, nowSec);
    return l.length ? l.map((x) => x.label).join(" · ") : null;
  };
  const has24 = (s: TickerSymbol) => lanesFor(set, s, nowSec).some((l) => l.basis === "stock24" || l.basis === "crypto24");
  const q = query.trim().toLowerCase();
  const match = (s: TickerSymbol) => !q || `${s} ${TICKERS[s].name}`.toLowerCase().includes(q);
  // Hot: the biggest movers on the day, ranked when the tab renders (the rows keep moving; the order holds still).
  const moveOf = (s: TickerSymbol) => {
    const t = liveTick(s);
    return Math.abs(dayChange(t ? Number(t.priceE8) / 1e8 : null, day?.[s]) ?? 0);
  };
  const hot = [...TICKER_SYMBOLS].sort((a, b) => moveOf(b) - moveOf(a)).slice(0, HOT_COUNT);
  const list: TickerSymbol[] =
    tab === "favourites" ? TICKER_SYMBOLS.filter((s) => settings.favourites.includes(s))
    : tab === "hot" ? hot
    : tab === "crypto" ? [...CRYPTO_SYMBOLS]
    : tab === "stocks" ? [...STOCK_SYMBOLS]
    : tab === "allDay" ? TICKER_SYMBOLS.filter(has24)
    : [...CRYPTO_SYMBOLS, ...STOCK_SYMBOLS];
  const shown = list.filter(match);
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={TERMINAL.picker.title}>
        {open ? (
          <div className="tm-picker">
            <input className="tm-input" type="search" placeholder={TERMINAL.picker.search} aria-label={TERMINAL.picker.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="tm-tabs" role="tablist" aria-label={TERMINAL.picker.title}>
              {TABS.map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className="tm-choice" onClick={() => (tapFeedback(), setTab(t))}>{TERMINAL.picker.tabs[t]}</button>
              ))}
            </div>
            {tab === "hot" && day === null ? <p className="tm-empty" role="status">{TERMINAL.picker.loadingMovers}</p>
              : shown.length === 0 ? <p className="tm-empty">{tab === "favourites" && !q ? TERMINAL.picker.noFavourites : TERMINAL.picker.noMatch}</p>
              : shown.map((s) => (
                <Row key={s} symbol={s} current={s === symbol} lanes={lanesOf(s)} day={day?.[s]} dayLoading={day === null} starred={settings.favourites.includes(s)} onPick={onPick} />
              ))}
            {(tab === "all" || tab === "stocks") && !q ? (
              <section aria-label={TERMINAL.picker.paused.title} className="tm-paused">
                <p className="tm-market-group">{TERMINAL.picker.paused.title}</p>
                {[TERMINAL.picker.paused.nflx, TERMINAL.picker.paused.preIpo].map((p) => (
                  <div key={p.name} className="tm-pos-text tm-paused-row">
                    <span className="tm-pos-title">{p.name}</span>
                    <span className="tm-pos-meta">{p.why}</span>
                  </div>
                ))}
              </section>
            ) : null}
            <p className="tm-market-group">
              <Link href="/markets" className="underline decoration-dotted underline-offset-4">{TERMINAL.picker.all}</Link>
              {" · "}
              <Link href="/markets#words" className="underline decoration-dotted underline-offset-4">{TERMINAL.picker.events}</Link>
            </p>
          </div>
        ) : null}
      </SlideOverContent>
    </SlideOver>
  );
}
