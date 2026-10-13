"use client";
// A memecoin's trade tape (R6 money, S02; D-230) on the 29368 streaming rows (`ui/streaming-rows`): Side · USD · $SYM ·
// Trader · Age, newest first, a trade that lands while the page is open sliding in on the accent wash. Its read is the
// page's one feed request, so it always agrees with the chart: rows while reading, the error with Retry, the named
// wait while the index catches up, "No trades yet" only after a read that found none.
import type { LaunchFeedWire, LaunchTradeWire } from "@cwf/core";
import { txUrl } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import { TriangleAlert } from "lucide-react";
import { Pill } from "@/components/kit/Pill";
import { EmptyState, StateFrame } from "@/components/states/EmptyState";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { launchFeed } from "@/components/states/shapes/launch";
import { WaitingText } from "@/components/states/WaitingText";
import { StreamingRows, type StreamColumn } from "@/components/ui/streaming-rows";
import { useNowMs } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { LAUNCH } from "./copy";
import type { FeedState } from "./feed-state";
import { ageText, coinText, usdShort } from "./format";

const K = LAUNCH.token;

export function FeedStates({ state, onRetry }: { state: Exclude<FeedState, "ready" | "empty">; onRetry: () => void }) {
  if (state === "loading") return <LoadingFrame shape="launch-feed">{launchFeed()}</LoadingFrame>;
  if (state === "error") return <StateFrame size="inline" tone="warning" role="alert" icon={<TriangleAlert />} title={K.tradesError} actions={<Pill tone="ink" size="sm" onClick={onRetry}>{LAUNCH.retry}</Pill>} />;
  return <div className="lp-wait"><WaitingText onRetry={onRetry}>{K.indexing}</WaitingText></div>;
}

export function TradeTape({ feed, state, symbol, onRetry, onBuy }: { feed: LaunchFeedWire | null; state: FeedState; symbol: string; onRetry: () => void; onBuy: () => void }) {
  const nowMs = useNowMs();
  const network = webEnv.markets.network;
  const rows = state === "ready" && feed ? [...feed.trades].reverse().slice(0, 100) : [];
  const columns: StreamColumn<LaunchTradeWire>[] = [
    { key: "side", header: K.tape.side, width: "chip", cell: (t) => <span className="lp-chip" data-side={t.isBuy ? "buy" : "sell"}>{t.isBuy ? K.buy : K.sell}</span> },
    { key: "usd", header: K.tape.usd, align: "end", cell: (t) => usdShort(t.quoteBase) },
    { key: "coin", header: `$${symbol}`, align: "end", cell: (t) => coinText(BigInt(t.coinRaw)) },
    { key: "who", header: K.tape.trader, cell: (t) => <a className="lp-link numbers" href={txUrl(t.txHash as `0x${string}`, network)} target="_blank" rel="noreferrer">{shortHex(t.trader as `0x${string}`)}</a> },
    { key: "age", header: K.tape.age, align: "end", width: "chip", cell: (t) => (nowMs > 0 ? ageText(t.atSec, Math.floor(nowMs / 1000)) : "") },
  ];
  if (state !== "ready" && state !== "empty") return <FeedStates state={state} onRetry={onRetry} />;
  return (
    <StreamingRows
      rows={rows}
      columns={columns}
      getRowId={(t) => `${t.txHash}:${t.logIndex}`}
      state="ready"
      loading={null}
      error={null}
      empty={<EmptyState size="inline" why={K.tradesEmpty} nextAction={{ label: K.buyFirst, onClick: onBuy }} />}
      caption={K.tape.caption}
      className="lp-tape"
    />
  );
}
