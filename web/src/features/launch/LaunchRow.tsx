"use client";
// One `/launch` row (R4-11, D-227) — from 21st.dev 22252 ssychui/market-watchlist, revamped onto Mitoshi's market rows:
// kept the watchlist's anatomy (logo, name over symbol, price, a per-row sparkline, the accent rail on the hovered row)
// and dropped its seeded demo series. A memecoin shows its curve price, the 23549 progress to graduation and a stage
// chip; its sparkline is the curve's own trades, read only once the row is on screen. A stablecoin shows its supply.
import type { Address } from "@cwf/core";
import type { LaunchRow as Row } from "@cwf/markets/launch";
import { useMemeTrades } from "@cwf/markets/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Sparkline } from "@/components/kit/desk-kit";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LAUNCH } from "./copy";
import { coinText, priceText } from "./format";
import { LogoDisc } from "./LogoDisc";

function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: "25%" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

function CurveSpark({ token, enabled }: { token: Address; enabled: boolean }) {
  const trades = useMemeTrades(token, enabled);
  const values = trades?.ok ? trades.value.slice(-48).map((t) => Number(t.priceE18 / 1_000_000n)) : [];
  if (values.length < 2) return <span className="lp-spark" aria-hidden />;
  const tone = values.at(-1)! >= values[0]! ? "up" : "down";
  return <Sparkline values={values} tone={tone} className="lp-spark" />;
}

export function LaunchRow({ row }: { row: Row }) {
  const { ref, seen } = useOnScreen<HTMLAnchorElement>();
  const meme = row.meme;
  return (
    <Link ref={ref} href={`/launch/${row.token}`} className="lp-row">
      <LogoDisc uri={row.logoURI} symbol={row.symbol} />
      <span className="lp-row-id">
        <span className="lp-row-name">{row.name}</span>
        <span className="lp-row-sym">${row.symbol}</span>
      </span>
      {meme ? (
        <>
          <span className="lp-row-progress">
            {meme.stage === "trading" ? (
              <ProgressBar compact value={meme.progressBps} max={10_000} label={LAUNCH.toGraduation(`${Math.floor(meme.progressBps / 100)}%`)} />
            ) : (
              <span className="lp-chip" data-stage={meme.stage}>{LAUNCH.stage[meme.stage]}</span>
            )}
          </span>
          <CurveSpark token={row.token} enabled={seen} />
          <span className="lp-row-price numbers">{priceText(meme.priceE18)}</span>
        </>
      ) : (
        <>
          <span className="lp-row-progress lp-row-meta">{LAUNCH.stableRow(coinText(row.totalSupply))}</span>
          <span className="lp-spark" aria-hidden />
          <span className="lp-chip">{LAUNCH.stablePair}</span>
        </>
      )}
    </Link>
  );
}
