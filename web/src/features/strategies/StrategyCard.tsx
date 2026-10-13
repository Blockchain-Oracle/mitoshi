"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/StrategyCard.tsx (R4-6, D-227) — one archive card on
// Mitoshi's registry: the portrait, the name and one mono instinct line, the cap pill, the one bold move (its settled net
// with the curve, or the honest tier), the tags (runner state, ERC-8004 id, sealed memory) and a foot that opens the
// drawer. The card never writes: a copy is stopped in the drawer, behind Hold to stop.
import { USD_DECIMALS } from "@cwf/core";
import { StatusDot, type DotTone } from "@/components/kit/desk-kit";
import { EquitySparkline } from "@/components/data/EquitySparkline";
import { cn } from "@/lib/utils";
import { AgentPortrait } from "./AgentPortrait";
import { STRATEGIES } from "./copy";
import { usdCap, usdSigned } from "./format";
import { instinctOf, strategyIdentity } from "./identity";
import type { StrategyWire } from "./protocol";
import { curvePoints } from "./record";
import "./strategies.css";

const S = STRATEGIES;
export type Tier = { key: "new" | "active" | "settled"; label: string };

/** Honest tiers: "Settled" is closed P&L (win or loss), never profit; a copied strategy is not "new". */
export function tierOf(c: StrategyWire): Tier {
  if (c.record.settled > 0) return { key: "settled", label: S.tiers.settled(c.record.settled) };
  if (c.record.fills >= 1) return { key: "active", label: S.tiers.active(c.record.open) };
  if (c.subscribers > 0) return { key: "new", label: S.tiers.copying(c.subscribers) };
  return { key: "new", label: S.tiers.fresh };
}

export const HEALTH_TONE: Record<StrategyWire["health"]["kind"], DotTone> = { alive: "live", stale: "warn", "never-started": "quiet", unknown: "quiet" };

export function StrategyCard({ card, copying, onOpen }: { card: StrategyWire; copying: "none" | "follow" | "fade"; onOpen: () => void }) {
  const { name, seed } = strategyIdentity(card);
  const net = BigInt(card.record.netBase);
  const settled = card.record.settled > 0;
  const memoryPrice = card.memory ? BigInt(card.memory.readPriceBase) : 0n;
  return (
    <div
      id={`strategy-${card.strategyId}`}
      role="button"
      tabIndex={0}
      aria-label={name}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="strat-card group flex flex-col"
    >
      <div className="flex items-start gap-3.5">
        <AgentPortrait seed={seed} name={name} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="strat-card-name text-ink">{name}</h3>
          <p className="strat-card-instinct truncate">{instinctOf(card)}</p>
        </div>
        <span className="strat-card-cap">
          {usdCap(BigInt(card.envelope.maxStakePerTradeBase))} <span className="text-ink/40">{S.card.max}</span>
        </span>
      </div>

      <div className="strat-card-move">
        {settled ? (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={cn("strat-card-net", net >= 0n ? "strat-card-net--gain" : "strat-card-net--loss")}>{usdSigned(net)}</span>
              <span className="strat-meta text-ink/40">{S.card.netMeta(card.record.settled)}</span>
            </div>
            {card.record.curve.length >= 2 && (
              <div className="-mx-1 mt-3 text-ink">
                <EquitySparkline points={curvePoints(card.record)} decimals={USD_DECIMALS} labels={{ empty: S.record.curveEmpty, curve: S.record.curve }} className="w-full" />
              </div>
            )}
          </>
        ) : (
          <div className="strat-mono-11 pt-2.5 uppercase tracking-[0.14em] text-ink/40">{tierOf(card).label}</div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="strat-card-tag strat-card-tag--line">
          <StatusDot tone={card.active ? HEALTH_TONE[card.health.kind] : "stopped"}>{card.active ? S.health[card.health.kind] : S.card.closed}</StatusDot>
        </span>
        {card.agentId && <span className="strat-card-tag strat-card-tag--quiet">{S.card.agent(card.agentId)}</span>}
        {card.memory && <span className="strat-card-tag strat-mem">{S.card.memory(memoryPrice)}</span>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <span className="strat-mono-10 truncate text-ink/40">{S.card.foot(BigInt(card.feeBase), card.subscribers)}</span>
        <span className={cn("strat-card-foot inline-flex shrink-0 items-center gap-1.5 transition-colors", copying === "none" ? "text-ink/55 group-hover:text-ink" : "")} data-on={copying !== "none" ? "" : undefined}>
          {copying !== "none" && <span className="strat-live-dot" aria-hidden />}
          {copying === "fade" ? S.card.fading : copying === "follow" ? S.card.copying : S.card.copy}
          <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </div>
  );
}
