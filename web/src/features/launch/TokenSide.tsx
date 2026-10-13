"use client";
// The token page's facts and, on desktop, its trade card (R6 money, S02; D-230): Market cap · 24h vol · Holders · Age as
// a 2 × 2 grid (the chain's price × supply; the index's day volume and holders), and from 1024 px the trade sheet's
// body inline in a sticky 22 rem column beside the chart, as Coinbase and Kraken put the order form (Refero 896c3d5f,
// 240a832f). A coin graduating takes no trade: the card says so (Graduating · Moving to Uniswap.).
import type { LaunchFeedWire } from "@cwf/core";
import type { MemeLaunch } from "@cwf/markets/launch";
import { BlockedCta } from "@/components/states/BlockedCta";
import { useNowMs } from "@/lib/clock";
import { LAUNCH } from "./copy";
import { ageText, capBase, usdShort } from "./format";
import { TradeForm, tradeLine } from "./TradeSheet";

const K = LAUNCH.token;
const DAY = 86_400;

export function TokenFacts({ m, feed }: { m: MemeLaunch; feed: LaunchFeedWire | null }) {
  const nowMs = useNowMs();
  const nowSec = Math.floor(nowMs / 1000);
  const vol = feed ? feed.trades.filter((t) => t.atSec >= nowSec - DAY).reduce((s, t) => s + BigInt(t.quoteBase), 0n) : null;
  const facts = [
    { label: K.marketCap, value: usdShort(capBase(m.config.totalSupply, m.priceE18)) },
    { label: K.vol, value: vol === null ? "—" : usdShort(vol) },
    { label: K.holders, value: feed ? String(feed.holders.count) : "—" },
    { label: K.age, value: nowMs > 0 ? ageText(Number(m.createdAtSec), nowSec) : "—" },
  ];
  return (
    <dl className="lp-facts">
      {facts.map((f) => (
        <div key={f.label}><dt>{f.label}</dt><dd className="numbers">{f.value}</dd></div>
      ))}
    </dl>
  );
}

export function TokenTradeCard({ m }: { m: MemeLaunch }) {
  return (
    <section className="lp-trade-card" aria-label={LAUNCH.trade.title(m.meta.symbol)}>
      <header className="lp-trade-card-head">
        <h2 className="type-body-strong text-ink">{LAUNCH.trade.title(m.meta.symbol)}</h2>
        <span className="type-caption text-ink-secondary">{tradeLine(m)}</span>
      </header>
      {m.stage === "complete" ? <BlockedCta blocker={{ label: K.graduating, reason: K.graduatingWhy, fix: null }} /> : <TradeForm m={m} side="buy" />}
    </section>
  );
}
