"use client";
// `/launch/[token]` (S17; R4-11, D-227; R6 money S02, D-230) — a pump.fun-grade token page. The head (logo, $SYM, the
// creator, the price and its move, the graduation bar) from the chain, head-fresh (`useMemeLaunch`: every quote and
// trade reads the chain; the index never gates a write); the candles, the trade tape and the holders from the index in
// ONE request (`useLaunchFeed`, `/api/launch?token=`), so the chart and the tabs always tell the same story — never "No
// trades yet" beside a read that hasn't answered. From 1024 px: the chart and tabs on the left, the trade card and the
// facts in a sticky 22 rem column (Coinbase, Kraken). On a phone: head, graduation, chart, facts, the Buy · Sell bar
// above the dock (it opens the trade sheet), then the tabs. A stablecoin has its own view; no launch here is the VOID.
import type { Address } from "@cwf/core";
import type { MemeLaunch } from "@cwf/markets/launch";
import { launchKeys, useLaunchFeed, useMemeLaunch } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pill } from "@/components/kit/Pill";
import { TextTabs, TextTabPanel } from "@/components/kit/TextTabs";
import { BlockedCta } from "@/components/states/BlockedCta";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { launchToken } from "@/components/states/shapes/launch";
import { useIsDesktop } from "@/features/terminal/useIsDesktop";
import { ReportDialog } from "@/features/social/report-dialog-lazy";
import { shortHex } from "@cwf/core/units";
import { LAUNCH } from "./copy";
import { feedState } from "./feed-state";
import { coinText } from "./format";
import { HolderList } from "./HolderList";
import { StablecoinView } from "./StablecoinView";
import { TokenChart } from "./TokenChart";
import { TokenHead } from "./TokenHead";
import { TokenFacts, TokenTradeCard } from "./TokenSide";
import { TokenYou } from "./TokenYou";
import { TradeSheet } from "./TradeSheet";
import { TradeTape } from "./TradeTape";
import "@/styles/launch.css";
import "@/components/kit/kit.css";

const K = LAUNCH.token;
type Tab = "trades" | "holders" | "you" | "safety";

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
  const feedReading = useLaunchFeed(m.token);
  const queryClient = useQueryClient();
  const desktop = useIsDesktop();
  const [tab, setTab] = useState<Tab>("trades");
  const [sheet, setSheet] = useState<"buy" | "sell" | null>(null);
  const [reporting, setReporting] = useState(false);
  const feed = feedReading?.ok ? feedReading.value : null;
  const state = feedState(feedReading, null);
  const retry = () => void queryClient.invalidateQueries({ queryKey: launchKeys.feed(m.token) });
  const buy = () => setSheet("buy");
  const graduating = m.stage === "complete";
  return (
    <section className="lp-token-page">
      <div className="lp-token-grid">
        <div className="lp-token-main">
          <TokenHead m={m} trades={feed?.trades ?? null} onReport={() => setReporting(true)} />
          <TokenChart feed={feed} state={state} symbol={m.meta.symbol} onRetry={retry} onBuy={buy} />
          {desktop ? null : <TokenFacts m={m} feed={feed} />}
          {desktop ? null : (
            <div className="lp-action page-action">
              {graduating ? (
                <BlockedCta blocker={{ label: K.graduating, reason: K.graduatingWhy, fix: null }} className="col-span-2" />
              ) : (
                <>
                  <Pill tone="up" size="lg" block data-primary-action="" onClick={buy}>{K.buy}</Pill>
                  <Pill tone="down" size="lg" block onClick={() => setSheet("sell")}>{K.sell}</Pill>
                </>
              )}
            </div>
          )}
          <TextTabs value={tab} onChange={setTab} label={m.meta.symbol} tabs={(Object.keys(K.tabs) as Tab[]).map((value) => ({ value, label: K.tabs[value] }))}>
            <TextTabPanel value="trades"><TradeTape feed={feed} state={state} symbol={m.meta.symbol} onRetry={retry} onBuy={buy} /></TextTabPanel>
            <TextTabPanel value="holders"><HolderList feed={feed} state={state} onRetry={retry} onBuy={buy} /></TextTabPanel>
            <TextTabPanel value="you"><TokenYou m={m} onBuy={graduating ? undefined : buy} /></TextTabPanel>
            <TextTabPanel value="safety"><Safety m={m} /></TextTabPanel>
          </TextTabs>
        </div>
        {desktop ? (
          <aside className="lp-token-side">
            <TokenTradeCard m={m} />
            <TokenFacts m={m} feed={feed} />
          </aside>
        ) : null}
      </div>
      {sheet ? <TradeSheet m={m} side={sheet} open onOpenChange={(o) => !o && setSheet(null)} /> : null}
      {reporting ? <ReportDialog open onOpenChange={setReporting} target={{ kind: "token", id: m.token }} urlKey="report" /> : null}
    </section>
  );
}

export function TokenScreen({ token }: { token: Address }) {
  const meme = useMemeLaunch(token);
  // The feed starts beside the chain read, not after it (same query as MemeView's): the chart lands with the head.
  useLaunchFeed(token);
  const queryClient = useQueryClient();
  if (meme === null) return <LoadingFrame shape="launch-token" className="lp-token-page">{launchToken()}</LoadingFrame>;
  // A failed read is not "no memecoin here": say so with Retry (the read also polls) instead of trying the stablecoin view.
  if (!meme.ok) return <section className="lp-token-page"><ErrorState diagnosis={meme.error} retry={() => void queryClient.invalidateQueries({ queryKey: launchKeys.meme(token) })} /></section>;
  if (meme.value) return <MemeView m={meme.value} />;
  return <StablecoinView token={token} />;
}
