"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/portfolio/plate/MoneyHero.tsx (P2, D-223; R4-4, D-227) — what is
// mine right now as one figure: dollars (wallet + Trading Balance), open positions at what Close pays, and what waits to
// be collected (`useMoney`, the one reading every surface shares); what can be bet now; Owarine's two pills under the
// line (Add money, Trade →); the legs (Owarine's right-hand list from 640 px, a compact grid on a phone, with an inline
// Collect when anything waits); the split as a bar. Pools that are yours but not in the figure are named under it, never
// added (FR-5). Every amount wears the privacy mask; "—" and a skeleton until every leg has read, never a $0.00 flash.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Masked } from "@/components/kit/Masked";
import { PillButton } from "@/components/kit/PillButton";
import { money as usd } from "@/features/terminal/format";
import { cn } from "@/lib/utils";
import { HERO_MONEY } from "../copy";
import type { Money } from "./useMoney";
import "@/components/kit/kit.css";

const LEGS = [
  { key: "dollars", tone: "mh-leg-dollars", label: HERO_MONEY.legs.dollars },
  { key: "positions", tone: "mh-leg-positions", label: HERO_MONEY.legs.positions },
  { key: "collect", tone: "mh-leg-collect", label: HERO_MONEY.legs.collect },
] as const;

export interface HeroCollect {
  busy: boolean;
  run: () => void;
}

export function MoneyHero({ money, settled, onAdd, collect }: { money: Money; settled: number | null; onAdd: () => void; collect: HeroCollect | null }) {
  const { decimals, ready } = money;
  const parts = { dollars: money.walletBase + money.tradingBase, positions: money.positionsBase, collect: money.collectBase } as const;
  const total = money.totalBase;
  // Before the reads land every figure reads "—", and the button doesn't offer test dollars to an account that may hold
  // some (R4-0: it flashed "$0.00" and "Get test dollars" on a funded account).
  const empty = ready && total === 0n;
  const amount = (base: bigint) => (ready ? <Masked>{usd(base, false, decimals)}</Masked> : HERO_MONEY.pending);
  const pct = (part: bigint) => (total > 0n ? Number((part * 1000n) / total) / 10 : 0);
  const counts = (
    <>
      <span><span className="numbers money-hero-strong">{money.openCount ?? "—"}</span> {HERO_MONEY.open}</span>
      <span aria-hidden>·</span>
      <span><span className="numbers money-hero-strong">{settled ?? "—"}</span> {HERO_MONEY.settled}</span>
    </>
  );
  return (
    <section className="money-hero" aria-label={HERO_MONEY.eyebrow}>
      <div className="money-hero-top">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="money-hero-eyebrow">{HERO_MONEY.eyebrow}</span>
          {ready ? (
            <span className="money-hero-figure numbers">
              <Masked>{usd(total, false, decimals)}</Masked>
            </span>
          ) : (
            <span className="skel money-hero-skel" role="img" aria-label={HERO_MONEY.pending} />
          )}
          <p className="money-hero-line">
            <span className="numbers money-hero-strong">{amount(money.readyBase)}</span> {HERO_MONEY.ready}
            {money.pools.map((p) => (
              <span key={p.id}>
                {" · "}
                {p.label} <span className="numbers money-hero-strong">{amount(p.amountBase)}</span> {HERO_MONEY.notSummed}
              </span>
            ))}
            <span className="money-hero-counts-inline">
              {" · "}
              {counts}
            </span>
          </p>
          <div className="money-hero-actions">
            <PillButton tone="accent" size="lg" onClick={onAdd}>{empty ? HERO_MONEY.getTest : HERO_MONEY.addMoney}</PillButton>
            <PillButton tone="white" size="lg" className="money-hero-white" nativeButton={false} render={<Link href="/trade/BTC" />}>
              {HERO_MONEY.trade} <ArrowRight aria-hidden />
            </PillButton>
          </div>
        </div>
        <dl className="money-hero-legs">
          {LEGS.map((leg) => (
            <div key={leg.key} className="mh-leg">
              <span aria-hidden className={cn("money-hero-dot", leg.tone)} />
              <dt className="mh-leg-label">{leg.label}</dt>
              <dd className="numbers mh-leg-amount">{amount(parts[leg.key])}</dd>
              {leg.key === "collect" && collect && ready && money.collectBase > 0n ? (
                <dd className="mh-leg-actcell">
                  <button type="button" className="mh-leg-act" disabled={collect.busy} aria-busy={collect.busy} onClick={collect.run}>
                    {collect.busy ? HERO_MONEY.collecting : HERO_MONEY.collect}
                  </button>
                </dd>
              ) : null}
            </div>
          ))}
          <div className="money-hero-counts">{counts}</div>
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
