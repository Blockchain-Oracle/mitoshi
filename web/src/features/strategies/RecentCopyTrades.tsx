"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/RecentCopyTrades.tsx — every copy trade the runner placed,
// newest first, each with its strategy, its side (a fade marked), what it cost and how it settled; each links its
// transaction on the explorer.
import { formatBaseUnits, txUrl, USD_DECIMALS } from "@cwf/core";
import { webEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { STRATEGIES as S } from "./copy";
import type { FillWire, StrategyWire } from "./protocol";

const usd = (base: bigint) => `$${formatBaseUnits(base < 0n ? -base : base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;

export function RecentCopyTrades({ fills, strategies }: { fills: readonly FillWire[]; strategies: readonly StrategyWire[] }) {
  const nameOf = new Map(strategies.map((s) => [s.strategyId, s.name]));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="recent-copy-trades">
      <h2 id="recent-copy-trades" className="type-title text-ink">{S.recent.title}</h2>
      {fills.length === 0 ? (
        <p className="type-body text-ink-secondary">{S.recent.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-surface-1">
          {fills.slice(0, 12).map((f) => {
            const pnl = f.pnlBase === null ? null : BigInt(f.pnlBase);
            return (
              <li key={f.txHash} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate type-body-strong text-ink">{nameOf.get(f.strategyId) ?? `#${f.strategyId}`}</span>
                  <span className="type-caption text-ink-secondary">
                    {f.label ?? f.marketId.slice(0, 10)} · {f.side.toUpperCase()}
                    {f.mode === "fade" ? ` (${S.recent.faded})` : ""} · {usd(BigInt(f.cashDeltaBase))} · {f.owner.slice(0, 6)}…{f.owner.slice(-4)}
                  </span>
                </div>
                <a href={txUrl(f.txHash as `0x${string}`, webEnv.markets.network)} target="_blank" rel="noreferrer" className={cn("shrink-0 type-body-strong tabular-nums", pnl === null ? "text-ink-secondary" : pnl > 0n ? "text-profit" : pnl < 0n ? "text-loss" : "text-ink")}>
                  {pnl === null ? "open" : `${pnl > 0n ? "+" : pnl < 0n ? "−" : ""}${usd(pnl)}`}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
