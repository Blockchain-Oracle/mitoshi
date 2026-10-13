"use client";
// `/launch/[token]` (S17; R4-11, D-227), laid out like the terminal (chart first, the action pinned at the bottom): the
// head row (logo, $SYM, price, Report), the curve's price from its own trades, the 23549 progress to graduation and the
// stage line, a Buy/Sell bar above the dock that opens the trade sheet, then TextTabs Trades · Holders · You · Safety
// (Ported from Owarine 90a91d71:web/src/components/kit/TextTabs.tsx). Claims show only when one is owed. A stablecoin
// branches to its own short view (StablecoinView). Everything is read from the chain; nothing is sampled.
import type { Address } from "@cwf/core";
import { txUrl } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import type { MemeLaunch, TimedMemeTrade as MemeTrade } from "@cwf/markets/launch";
import { useMemeLaunch, useMemeTrades } from "@cwf/markets/react";
import { Flag } from "lucide-react";
import { useState } from "react";
import { PillButton } from "@/components/kit/PillButton";
import { TextTabs, TextTabPanel } from "@/components/kit/TextTabs";
import { Sparkline } from "@/components/kit/desk-kit";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ReportDialog } from "@/features/social/report-dialog-lazy";
import { webEnv } from "@/lib/env";
import { LAUNCH } from "./copy";
import { bpsText, capBase, changeText, coinText, priceText, usdText } from "./format";
import { LogoDisc } from "./LogoDisc";
import { StablecoinView } from "./StablecoinView";
import { TokenYou } from "./TokenYou";
import { TradeSheet } from "./TradeSheet";
import "@/styles/launch.css";
import "@/components/kit/kit.css";

const K = LAUNCH.token;
type Tab = "trades" | "holders" | "you" | "safety";

function Trades({ trades }: { trades: MemeTrade[] }) {
  const network = webEnv.markets.network;
  if (trades.length === 0) return <p className="lp-note">{K.tradesEmpty}</p>;
  return (
    <ol className="lp-trades">
      {[...trades].reverse().slice(0, 50).map((t) => (
        <li key={`${t.txHash}-${t.coin}`} className="lp-trade">
          <span className="lp-chip" data-side={t.isBuy ? "buy" : "sell"}>{t.isBuy ? K.buy : K.sell}</span>
          <span className="numbers">{usdText(t.quote)}</span>
          <span className="numbers text-ink-secondary">{coinText(t.coin)}</span>
          <a className="numbers lp-link" href={txUrl(t.txHash, network)} target="_blank" rel="noreferrer">{shortHex(t.trader)}</a>
        </li>
      ))}
    </ol>
  );
}

/** Net coin bought on the curve per trader — the curve's own record, not every transfer (said under the list). */
function Holders({ trades, sold }: { trades: MemeTrade[]; sold: bigint }) {
  const net = new Map<string, bigint>();
  for (const t of trades) net.set(t.trader, (net.get(t.trader) ?? 0n) + (t.isBuy ? t.coin : -t.coin));
  const rows = [...net.entries()].filter(([, v]) => v > 0n).sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 20);
  if (rows.length === 0) return <p className="lp-note">{K.tradesEmpty}</p>;
  return (
    <div className="lp-holders">
      {rows.map(([who, coin]) => {
        const bps = sold > 0n ? Number((coin * 10_000n) / sold) : 0;
        return (
          <div key={who} className="lp-holder">
            <span className="numbers">{shortHex(who)}</span>
            <span className="lp-holder-bar" aria-hidden><span style={{ width: `${Math.min(100, bps / 100)}%` }} /></span>
            <span className="numbers">{bpsText(bps)}</span>
          </div>
        );
      })}
      <p className="lp-note">{K.holdersLine}</p>
    </div>
  );
}

function Safety({ m }: { m: MemeLaunch }) {
  const S = K.safety;
  return (
    <ul className="lp-safety">
      <li>{S.fixedSupply(coinText(m.config.totalSupply))}</li>
      <li>{S.curve}</li>
      <li>{S.locked}</li>
      <li className="numbers">{S.creator(shortHex(m.creator))}</li>
    </ul>
  );
}

function MemeView({ m }: { m: MemeLaunch }) {
  const trades = useMemeTrades(m.token);
  const list = trades?.ok ? trades.value : [];
  const [tab, setTab] = useState<Tab>("trades");
  const [sheet, setSheet] = useState<"buy" | "sell" | null>(null);
  const [reporting, setReporting] = useState(false);
  const values = list.map((t) => Number(t.priceE18 / 1_000_000n));
  const change = changeText(m.priceE18, list, Math.floor(Date.now() / 1000));
  const stageLine = m.stage === "trading" ? LAUNCH.toGraduation(`${Math.floor(m.progressBps / 100)}%`) : m.stage === "complete" ? K.graduating : K.onUniswap;
  return (
    <section className="lp-page lp-token">
      <header className="lp-token-head">
        <LogoDisc uri={m.meta.logoURI} symbol={m.meta.symbol} size="lg" />
        <span className="lp-row-id">
          <span className="lp-row-name">{m.meta.name}</span>
          <span className="lp-row-sym">${m.meta.symbol}</span>
        </span>
        <span className="lp-token-price numbers">
          {priceText(m.priceE18)}
          {change ? <span className="lp-change" data-up={change.up ? "" : undefined}>{change.text} {change.since === "24h" ? K.day : K.sinceLaunch}</span> : null}
        </span>
        <button type="button" className="lp-icon" aria-label={K.report} title={K.report} onClick={() => setReporting(true)}><Flag aria-hidden className="size-4" /></button>
      </header>
      <div className="lp-chart">{values.length >= 2 ? <Sparkline values={values} width={640} height={180} className="lp-chart-line" stretch /> : <p className="lp-note">{trades === null ? K.reading : K.tradesEmpty}</p>}</div>
      {m.stage === "trading" ? <ProgressBar value={m.progressBps} max={10_000} label={stageLine} valueText={`${usdText(m.quoteReserve)} / ${usdText(m.config.migrationQuoteThreshold)}`} /> : <p className="lp-stage" data-stage={m.stage}>{stageLine}</p>}
      <dl className="lp-facts">
        <div><dt>{K.marketCap}</dt><dd className="numbers">{usdText(capBase(m.config.totalSupply, m.priceE18))}</dd></div>
        <div><dt>{K.raised}</dt><dd className="numbers">{usdText(m.quoteReserve)}</dd></div>
        <div><dt>{K.feeNow}</dt><dd className="numbers">{bpsText(m.feeBpsNow)}</dd></div>
      </dl>
      <div className="lp-action page-action">
        <PillButton tone="up" size="lg" block disabled={m.stage === "complete"} onClick={() => setSheet("buy")}>{K.buy}</PillButton>
        <PillButton tone="down" size="lg" block disabled={m.stage === "complete"} onClick={() => setSheet("sell")}>{K.sell}</PillButton>
      </div>
      <TextTabs value={tab} onChange={setTab} label={m.meta.symbol} tabs={(Object.keys(K.tabs) as Tab[]).map((value) => ({ value, label: K.tabs[value] }))}>
        <TextTabPanel value="trades"><Trades trades={list} /></TextTabPanel>
        <TextTabPanel value="holders"><Holders trades={list} sold={m.coinSold} /></TextTabPanel>
        <TextTabPanel value="you"><TokenYou m={m} /></TextTabPanel>
        <TextTabPanel value="safety"><Safety m={m} /></TextTabPanel>
      </TextTabs>
      {sheet ? <TradeSheet m={m} side={sheet} open onOpenChange={(o) => !o && setSheet(null)} /> : null}
      {reporting ? <ReportDialog open onOpenChange={setReporting} target={{ kind: "token", id: m.token }} urlKey="report" /> : null}
    </section>
  );
}

export function TokenScreen({ token }: { token: Address }) {
  const meme = useMemeLaunch(token);
  if (meme === null) return <section className="lp-page"><p role="status" className="lp-note">{K.reading}</p></section>;
  // A failed read is not "no memecoin here": say so (the read polls again) instead of trying the stablecoin view.
  if (!meme.ok) return <section className="lp-page"><p role="alert" className="lp-note">{K.failed}</p></section>;
  if (meme.value) return <MemeView m={meme.value} />;
  return <StablecoinView token={token} />;
}
