"use client";
// A launch's holders (R6 money, S02; D-230): real balances from the token's own transfers (the index), not the curve's
// trades — "14 holders" (the curve, the pool, the locker and the zero address left out), then the 20 largest, each with
// its share of supply as one bar (From 21st.dev 26545 8starlabs/partition-bar's grammar, one segment against the whole)
// and its tag: Curve, Pool or Creator. States as the tape's (one request answers both).
import type { LaunchFeedWire } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import Link from "next/link";
import type { CSSProperties } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { LAUNCH } from "./copy";
import type { FeedState } from "./feed-state";
import { bpsText } from "./format";
import { FeedStates } from "./TradeTape";

const K = LAUNCH.token;

export function HolderList({ feed, state, onRetry, onBuy }: { feed: LaunchFeedWire | null; state: FeedState; onRetry: () => void; onBuy: () => void }) {
  if (state !== "ready" && state !== "empty") return <FeedStates state={state} onRetry={onRetry} />;
  const supply = feed?.launch?.totalSupply ? BigInt(feed.launch.totalSupply) : 0n;
  const top = feed?.holders.top ?? [];
  if (top.length === 0) return <EmptyState size="inline" why={K.holdersEmpty} nextAction={{ label: K.buyFirst, onClick: onBuy }} />;
  return (
    <div className="lp-holders">
      <p className="lp-holders-count numbers">{K.holdersCount(feed?.holders.count ?? 0)}</p>
      <ol className="lp-holder-list">
        {top.map((h) => {
          const bps = supply > 0n ? Number((BigInt(h.balanceRaw) * 10_000n) / supply) : 0;
          return (
            <li key={h.holder} className="lp-holder">
              <Link href={`/u/${h.holder}`} className="lp-holder-who numbers">
                {shortHex(h.holder as `0x${string}`)}
                {h.label ? <span className="lp-holder-tag">{K.holderTag[h.label]}</span> : null}
              </Link>
              <span className="lp-holder-bar" aria-hidden><span style={{ "--lp-share": `${Math.min(100, bps / 100)}%` } as CSSProperties} /></span>
              <span className="lp-holder-pct numbers">{bpsText(bps)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
