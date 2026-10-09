"use client";
/**
 * /markets as the list (S23j, D-192; first ported from Masayume 68f7a09:web/src/features/markets/{MarketsPage,
 * MarketsScreen}.tsx): every Window, in lanes and in plain words, with the user's own calls pinned on top (D-048). A
 * Window opens on the terminal (`/trade/<SYM>?w=<id>`) — the hero chart and its ticket retired with the terminal, which
 * now carries the chart, the one-tap call and the other modes. No clock is read here: countdowns, cards and the board
 * tick as leaves (ux-audit fix 12). Live data: the D-049 stream marks the visible Windows and the wallet's reads stale
 * as events land (`useLiveMarketData`). Old share links (`/markets?m=<id>`) land on the terminal too.
 */
import type { MarketId } from "@cwf/core";
import { parseMarketsSearch } from "@cwf/core/urls";
import { useLiveMarketData } from "@cwf/markets/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { MotionScope } from "@/components/motion-scope";
import SectionHead from "@/components/shell/SectionHead";
import { tapFeedback } from "@/lib/feedback";
import { useWalletSession } from "@/lib/wallet-session";
import { MARKETS, SECTIONS } from "./copy";
import { YourCalls } from "./calls/YourCalls";
import { MarketsHead } from "./MarketsHead";
import { MarketsAllowance } from "@/features/session/MarketsAllowance";
import { terminalHref } from "@/features/terminal/route";
import { tickerMarkets } from "./data/lane-view";
import { useLanesState } from "./data/useLanesState";
import { findMarket } from "./data/useSelection";
import { CadenceLanes } from "./lanes/CadenceLanes";
import { WordMarketBoard } from "./word-board/WordMarketBoard";

/** The motion scope rides inside the island, so motion's runtime never enters the route's first load (§3.1). */
export function MarketsScreen() {
  return (
    <MotionScope>
      <Screen />
    </MotionScope>
  );
}

function Screen() {
  const router = useRouter();
  const params = useSearchParams();
  const { address } = useWalletSession();
  const lanes = useLanesState();
  const visible = lanes.activeLane ? tickerMarkets(lanes.activeLane, lanes.ticker).slice(0, 8).map((m) => m.marketId) : [];
  useLiveMarketData({ marketIds: visible, wallet: address });

  // A share link from before the terminal (`?m=<id>`) opens that Window there.
  const linked = parseMarketsSearch(params).marketId;
  useEffect(() => {
    if (linked) router.replace(`/trade?w=${linked}`);
  }, [linked, router]);

  const open = (marketId: MarketId) => {
    tapFeedback();
    const m = findMarket(lanes.laneSet, marketId);
    router.push(m ? terminalHref(m.asset, marketId) : `/trade?w=${marketId}`);
  };

  return (
    <div className="markets-main">
      <div className="container">
        <MarketsHead />
        <MarketsAllowance />
        <YourCalls />
        <section className="markets-section flex flex-col gap-4" aria-label={SECTIONS.lanes.title}>
          <SectionHead number={SECTIONS.lanes.index} title={SECTIONS.lanes.title} live />
          <CadenceLanes state={lanes} selectedMarketId={null} onSelect={open} />
        </section>
        <section id="words" className="markets-section flex flex-col gap-4 scroll-mt-4" aria-label={SECTIONS.words.title}>
          <SectionHead number={SECTIONS.words.index} title={SECTIONS.words.title} desc={SECTIONS.words.desc} />
          <WordMarketBoard laneSet={lanes.laneSet} onSelect={open} />
        </section>
      </div>
    </div>
  );
}
