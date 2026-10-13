"use client";
// A follower's own read of a theme (S16; R4-11, D-227) — Ported from Owarine 90a91d71's desk cockpit OverviewTab (the
// now-vs-target Donut ring pair and LimitGauges): the outer ring is what the wallet holds now, weighed by core's
// `themeDrift` exactly as the agent weighs it (each member at its StockReference price, pathUSD inside the allocation),
// the inner ring the theme's targets; the gauges are the follow's day (spent of the daily cap, from `followOf`) and
// the allocation invested. Only for a live follow; every figure is read from the chain.
import { themeDrift, type Address } from "@cwf/core";
import type { ThemeView } from "@cwf/markets/themes";
import { useBalanceSheet, useThemeFollow, useThemeHoldings } from "@cwf/markets/react";
import { Donut, RadialGauge } from "@/components/kit/desk-kit";
import { THEMES } from "./copy";
import { pct, sliceColor, usd6 } from "./format";

const Y = THEMES.you;

export function ThemeYou({ t, who }: { t: ThemeView; who: Address }) {
  const follow = useThemeFollow(who, t.themeId);
  const holdings = useThemeHoldings(who, t.themeId);
  const sheet = useBalanceSheet(who);
  const f = follow?.ok ? follow.value : null;
  if (!f?.active || !holdings?.ok || !sheet?.ok) return null;
  const balanceOf = new Map(holdings.value.map((h) => [h.token.toLowerCase(), h.balance]));
  const members = t.members.map((m) => ({ token: m.token, balance: balanceOf.get(m.token.toLowerCase()) ?? 0n, priceE18: m.refPriceE18, band: m.band }));
  const drift = themeDrift(members, sheet.value.spendableBase, f.caps.allocationUsd);
  const held = [...t.members.map((m, i) => ({ id: m.symbol, label: `${m.symbol} ${pct(drift.rows[i]!.weightBps)}`, value: drift.rows[i]!.weightBps, color: sliceColor(i) })), { id: "cash", label: `${THEMES.theme.cash} ${pct(drift.cashBps)}`, value: drift.cashBps, color: "var(--color-surface-3)" }];
  const target = [...t.members.map((m, i) => ({ id: m.symbol, label: `${m.symbol} ${pct(m.band.targetBps)}`, value: m.band.targetBps, color: sliceColor(i) })), { id: "cash", label: `${THEMES.theme.cash} ${pct(t.cash.targetBps)}`, value: t.cash.targetBps, color: "var(--color-surface-3)" }];
  // The router's day restarts 24 h after `dayStart`; until then `daySpentUsd` counts against the daily cap.
  const daySpent = Date.now() / 1000 >= Number(f.dayStart) + 86_400 ? 0n : BigInt(f.daySpentUsd);
  const invested = drift.totalUsd - drift.cashUsd;
  const share = (part: bigint, whole: bigint) => (whole > 0n ? Number((part * 10_000n) / whole) / 100 : 0);
  const out = drift.rows.filter((r) => r.out !== null).length;
  return (
    <div className="th-you">
      <div className="th-you-rings">
        <Donut slices={held} label={Y.held} size={168} thickness={14}>
          <span className="th-donut-figure numbers">{drift.priced ? usd6(drift.totalUsd) : "—"}</span>
          <span className="th-donut-label">{Y.held}</span>
        </Donut>
        <span className="th-you-inner"><Donut slices={target} label={THEMES.theme.target} size={124} thickness={10} /></span>
      </div>
      <div className="th-overview-side">
        <p className="type-body-strong text-ink">{!drift.priced ? Y.unpriced : out === 0 ? Y.inBand : Y.outOfBand(out)}</p>
        <div className="th-you-gauges">
          <RadialGauge value={share(daySpent, f.caps.maxDailyUsd)} label={Y.today}><span className="numbers type-caption">{pct(Math.round(share(daySpent, f.caps.maxDailyUsd) * 100))}</span></RadialGauge>
          <span className="th-you-gauge-text"><span className="th-donut-label">{Y.today}</span><span className="numbers">{Y.of(usd6(daySpent), usd6(f.caps.maxDailyUsd))}</span></span>
          <RadialGauge value={share(invested, f.caps.allocationUsd)} label={Y.invested}><span className="numbers type-caption">{pct(Math.round(share(invested, f.caps.allocationUsd) * 100))}</span></RadialGauge>
          <span className="th-you-gauge-text"><span className="th-donut-label">{Y.invested}</span><span className="numbers">{Y.of(usd6(invested), usd6(f.caps.allocationUsd))}</span></span>
        </div>
      </div>
    </div>
  );
}
