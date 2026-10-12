"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/portfolio/plate/MoneyHero.tsx (P2, D-223) — what is mine right
// now as one figure: dollars (wallet + Trading Balance), open positions at their mark, and what waits to be collected;
// what can be bet now; Add money and Trade; the split as a bar. Pools that are yours but not in the figure are named
// under it, never added (FR-5).
import { formatBaseUnits } from "@cwf/core/units";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { HERO_MONEY } from "../copy";

const fmt2 = (base: bigint, decimals: number) => formatBaseUnits(base, decimals, { maxDp: 2, minDp: 2 });

const LEGS = [
  { key: "dollars", tone: "mh-leg-dollars", label: HERO_MONEY.legs.dollars },
  { key: "positions", tone: "mh-leg-positions", label: HERO_MONEY.legs.positions },
  { key: "collect", tone: "mh-leg-collect", label: HERO_MONEY.legs.collect },
] as const;

export interface HeroMoney {
  decimals: number;
  dollarsBase: bigint;
  readyBase: bigint;
  positionsBase: bigint;
  collectBase: bigint;
  /** Named under the figure, never in it: resting-order escrow, credit on Windows. */
  pools: { id: string; label: string; amountBase: bigint }[];
  ready: boolean;
}

export function MoneyHero({ money, openBets, settled, onAdd }: { money: HeroMoney; openBets: number; settled: number; onAdd: () => void }) {
  const { decimals } = money;
  const parts = { dollars: money.dollarsBase, positions: money.positionsBase, collect: money.collectBase } as const;
  const total = parts.dollars + parts.positions + parts.collect;
  const empty = total === 0n;
  const pct = (part: bigint) => (total > 0n ? Number((part * 1000n) / total) / 10 : 0);
  return (
    <section className="money-hero" aria-label={HERO_MONEY.eyebrow}>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="money-hero-eyebrow">{HERO_MONEY.eyebrow}</span>
          <span className={cn("money-hero-figure numbers", !money.ready && "opacity-50")}>${fmt2(total, decimals)}</span>
          <p className="money-hero-line">
            <span className="numbers money-hero-strong">${fmt2(money.readyBase, decimals)}</span> {HERO_MONEY.ready}
            {money.pools.map((p) => (
              <span key={p.id}>
                {" · "}
                {p.label} <span className="numbers money-hero-strong">${fmt2(p.amountBase, decimals)}</span> {HERO_MONEY.notSummed}
              </span>
            ))}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onAdd} className="money-hero-primary">{empty ? HERO_MONEY.getTest : HERO_MONEY.addMoney}</button>
            <Link href="/trade/BTC" className="money-hero-secondary">
              {HERO_MONEY.trade} <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
        <dl className="grid w-full max-w-[22rem] gap-3">
          {LEGS.map((leg) => (
            <div key={leg.key} className="flex items-center gap-3">
              <span aria-hidden className={cn("money-hero-dot", leg.tone)} />
              <dt className="min-w-0 flex-1 truncate money-hero-leg">{leg.label}</dt>
              <dd className="numbers money-hero-amount">${fmt2(parts[leg.key], decimals)}</dd>
            </div>
          ))}
          <div className="money-hero-counts">
            <span><span className="numbers money-hero-strong">{openBets}</span> {HERO_MONEY.open}</span>
            <span aria-hidden>·</span>
            <span><span className="numbers money-hero-strong">{settled}</span> {HERO_MONEY.settled}</span>
          </div>
        </dl>
      </div>
      <div className="money-hero-bar" aria-hidden>
        {LEGS.map((leg) => {
          const width = pct(parts[leg.key]);
          return width > 0 ? <span key={leg.key} className={cn("money-hero-seg", leg.tone)} style={{ width: `${width}%` }} /> : null;
        })}
      </div>
    </section>
  );
}
