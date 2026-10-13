"use client";
// One board row (R6 money, S08; D-230) — From 21st.dev 20110 ssychui/market-watchlist (was `LaunchRow.tsx`, R4-11):
// the watchlist's anatomy (logo, name over $SYM, a per-row sparkline, price, the accent rail on the hovered row) with
// its seeded ASSETS and points dropped and the launchpad's columns added — market cap, 24 h volume, holders, age and
// the curve (the 23549 progress bar, or the stage chip). The sparkline is the coin's last 48 indexed prices from the
// board's own payload: no per-row chain read. From 1024 px a table row; on a phone a card: logo, name and market cap,
// then the curve, then "$1,204 vol · 14 holders · 3 d". A team launch wears "Test".
import type { LaunchBoardRowWire } from "@cwf/core";
import Link from "next/link";
import { Sparkline } from "@/components/kit/desk-kit";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LAUNCH } from "./copy";
import { ageText, coinText, priceNum, priceText, usdShort } from "./format";
import { LogoDisc } from "./LogoDisc";

export function BoardRow({ row, rank, nowSec }: { row: LaunchBoardRowWire; rank: number; nowSec: number }) {
  const meme = row.kind === "memecoin";
  const values = row.spark.map(priceNum);
  const tone = values.length >= 2 && values.at(-1)! < values[0]! ? "down" : "up";
  const symbol = row.symbol ?? "";
  const age = nowSec > 0 ? ageText(row.createdSec, nowSec) : "—";
  const cap = meme ? (row.mcapBase ? usdShort(row.mcapBase) : "—") : row.totalSupply ? coinText(BigInt(row.totalSupply)) : "—";
  return (
    <Link href={`/launch/${row.token}`} className="lp-brow">
      <span className="lp-brow-rank numbers">{rank}</span>
      <LogoDisc uri={row.logoURI ?? ""} symbol={symbol} />
      <span className="lp-brow-id">
        <span className="lp-row-name">{row.name ?? symbol}</span>
        <span className="lp-row-sym">
          ${symbol}
          {row.team ? <span className="lp-test-tag">{LAUNCH.testTag}</span> : null}
        </span>
      </span>
      <span className="lp-brow-cap numbers">{cap}</span>
      <span className="lp-brow-vol numbers">{usdShort(row.vol24hBase)}</span>
      <span className="lp-brow-holders numbers">{row.holders}</span>
      <span className="lp-brow-age numbers">{age}</span>
      <span className="lp-brow-curve">
        {!meme ? (
          <span className="lp-chip">{LAUNCH.stablePair}</span>
        ) : row.stage === "trading" ? (
          <span className="lp-brow-progress">
            <ProgressBar compact value={row.progressBps} max={10_000} label={LAUNCH.toGraduation(`${Math.floor(row.progressBps / 100)}%`)} />
            <span className="numbers">{Math.floor(row.progressBps / 100)}%</span>
          </span>
        ) : (
          <span className="lp-chip" data-stage={row.stage}>{LAUNCH.stage[row.stage]}</span>
        )}
      </span>
      <span className="lp-brow-spark" aria-hidden>{values.length >= 2 ? <Sparkline values={values} tone={tone} className="lp-spark" /> : null}</span>
      <span className="lp-brow-price numbers">{row.priceE18 ? priceText(BigInt(row.priceE18)) : "—"}</span>
      <span className="lp-brow-line numbers">{LAUNCH.rowLine(usdShort(row.vol24hBase), row.holders, age)}</span>
    </Link>
  );
}
