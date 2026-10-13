"use client";
// A memecoin's head (R6 money, S02; D-230), pump.fun's: the logo, the name over $SYM, the creator (to their profile), the
// price with its 24 h move (else since launch), Report — and the graduation bar in the head (From 21st.dev 23549
// ddoemonn/progress-bar, `ui/progress-bar`): "62% to graduation · $3,100 / $5,000", or the Graduating / On Uniswap chip.
// The facts are the chain's (`useMemeLaunch`, head-fresh); the move is the index's trades.
import { dayChangeBps, type LaunchTradeWire } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import type { MemeLaunch } from "@cwf/markets/launch";
import { Flag } from "lucide-react";
import Link from "next/link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useNowMs } from "@/lib/clock";
import { LAUNCH } from "./copy";
import { priceText, usdText } from "./format";
import { LogoDisc } from "./LogoDisc";

const K = LAUNCH.token;

export function TokenHead({ m, trades, onReport }: { m: MemeLaunch; trades: readonly LaunchTradeWire[] | null; onReport: () => void }) {
  const nowMs = useNowMs();
  const change = trades && nowMs > 0 ? dayChangeBps(m.priceE18, trades.map((t) => ({ atSec: t.atSec, priceE18: BigInt(t.priceE18) })), Math.floor(nowMs / 1000)) : null;
  const pct = change ? `${change.bps >= 0 ? "+" : "−"}${(Math.abs(change.bps) / 100).toFixed(1)}%` : null;
  return (
    <header className="lp-token-head">
      <LogoDisc uri={m.meta.logoURI} symbol={m.meta.symbol} size="lg" />
      <span className="lp-row-id">
        <span className="lp-row-name">{m.meta.name}</span>
        <span className="lp-row-sym">
          ${m.meta.symbol} · <Link href={`/u/${m.creator}`} className="lp-creator">{K.creator} {shortHex(m.creator)}</Link>
        </span>
      </span>
      <span className="lp-token-price numbers">
        {priceText(m.priceE18)}
        {pct ? <span className="lp-change" data-up={change!.bps >= 0 ? "" : undefined}>{pct} {change!.since === "24h" ? K.day : K.sinceLaunch}</span> : null}
      </span>
      <button type="button" className="lp-icon" aria-label={K.report} title={K.report} onClick={onReport}><Flag aria-hidden className="size-4" /></button>
      <div className="lp-token-grad">
        {m.stage === "trading" ? (
          <ProgressBar value={m.progressBps} max={10_000} label={LAUNCH.toGraduation(`${Math.floor(m.progressBps / 100)}%`)} valueText={K.raisedOf(usdText(m.quoteReserve), usdText(m.config.migrationQuoteThreshold))} />
        ) : (
          <span className="lp-chip" data-stage={m.stage}>{m.stage === "complete" ? K.graduating : K.onUniswap}</span>
        )}
      </div>
    </header>
  );
}
