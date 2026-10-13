"use client";
/**
 * The ticker hub's islands (P5; R4-10, D-227): the actions render at once (Trade it is THE action — accent, first, full
 * width on a phone — and sticks above the dock while the head is on screen); the session chip, the facts and the
 * sections wait for the late data layer (§3.1, D-071), each with a quiet placeholder of its own shape.
 */
import type { TickerSymbol } from "@cwf/core";
import type { TractionCall } from "@cwf/db/idx";
import { MessageCircle } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { pillButtonVariants } from "@/components/kit";
import { LoadingState } from "@/components/states";
import type { Article } from "@/features/news/wire";
import { openDrawer } from "@/lib/drawer-param";
import { useDataReady } from "@/providers/data/context";
import { STOCKS } from "./copy";
import "@/styles/market-card.css";
import "@/styles/news.css";
import "@/styles/news-wire.css";
import "./stocks.css";

export interface StockHubProps {
  symbol: TickerSymbol;
  /** The ticker's headlines from the server's read; null when the wire couldn't be read. */
  articles: Article[] | null;
  /** No Finnhub key on this deployment: the section says so instead of showing nothing. */
  headlinesOff: boolean;
  /** The ticker's newest call sides from the index; null when the index couldn't be read. */
  calls: TractionCall[] | null;
  readAtMs: number;
}

const load = () => import("./StockHubScreen");
const SessionIsland = dynamic(() => load().then((m) => m.HubSessionChip), { ssr: false, loading: () => null });
const FactsIsland = dynamic(() => load().then((m) => m.HubFacts), { ssr: false, loading: () => <FactsWait /> });
const BodyIsland = dynamic(() => load().then((m) => m.HubBody), { ssr: false, loading: () => <LoadingState shape="cards" /> });

function FactsWait() {
  return <dl className="stk-stats" aria-busy="true"><div className="stk-stat"><dt>{STOCKS.spot}</dt><dd className="numbers">{STOCKS.dash}</dd></div></dl>;
}

export function HubSession({ symbol }: { symbol: TickerSymbol }) {
  return useDataReady() ? <SessionIsland symbol={symbol} /> : null;
}

export function StockHubPage(props: StockHubProps) {
  const ready = useDataReady();
  return (
    <>
      <div className="stk-bar">
        {ready ? <FactsIsland symbol={props.symbol} /> : <FactsWait />}
        <div className="stk-actions page-action">
          <Link href={`/trade/${props.symbol}`} className={pillButtonVariants({ tone: "accent", size: "md", className: "stk-trade" })} data-primary-action>
            {STOCKS.trade}
          </Link>
          <button type="button" className={pillButtonVariants({ tone: "ghost", size: "md", className: "stk-room" })} onClick={() => openDrawer("room")}>
            <MessageCircle aria-hidden className="size-4" />
            {STOCKS.room(props.symbol)}
            <span className="stk-room-meta">{STOCKS.roomQualifier}</span>
          </button>
        </div>
      </div>
      {ready ? <BodyIsland {...props} /> : <LoadingState shape="cards" />}
    </>
  );
}
