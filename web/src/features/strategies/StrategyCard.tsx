"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/StrategyCard.tsx — who it is (its ERC-8004 agent), the
// one bold figure (its settled net with the sample size, or honestly none yet), its runner's state in the runner's
// words, and the copy toggle (21st 26650). Gradients stripped (plan: "strip gradients").
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyToggle } from "./CopyToggle";
import { STRATEGIES as S } from "./copy";
import type { StrategyWire } from "./protocol";

const HEALTH_DOT: Record<StrategyWire["health"]["kind"], string> = { alive: "bg-profit", stale: "bg-warning", "never-started": "bg-ink-muted", unknown: "bg-ink-muted" };

export function StrategyCard({ card, copying, onOpen, onCopy, onStop }: { card: StrategyWire; copying: "none" | "follow" | "fade"; onOpen: () => void; onCopy: () => void; onStop: () => void }) {
  const net = BigInt(card.record.netBase);
  const settled = card.record.settled > 0;
  return (
    <article
      className="group flex flex-col gap-4 rounded-lg border border-hairline bg-surface-1 p-5 transition-colors hover:border-ink-muted"
      aria-labelledby={`strategy-${card.strategyId}-name`}
    >
      <button type="button" onClick={onOpen} className="flex flex-col gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 id={`strategy-${card.strategyId}-name`} className="type-title text-ink truncate">{card.name}</h3>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-secondary">
              <span>{S.card.series(card.envelope.seriesLabel)}</span>
              {card.agentId && (
                <span className="inline-flex items-center gap-1">
                  <Bot aria-hidden className="size-3" />
                  {S.card.agent(card.agentId)}
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-hairline px-2.5 py-1 type-caption text-ink-secondary">{BigInt(card.feeBase) === 0n ? S.card.free : S.card.fee(BigInt(card.feeBase))}</span>
        </div>
        {card.specText && <p className="type-body text-ink-secondary line-clamp-3">{card.specText}</p>}
        <div className="flex flex-col gap-0.5">
          {settled ? (
            <>
              <span className={cn("type-title tabular-nums", net > 0n ? "text-profit" : net < 0n ? "text-loss" : "text-ink")}>{S.card.net(net)}</span>
              <span className="type-caption text-ink-secondary">{S.card.sample(card.record.settled, card.record.wins, card.record.losses)}{card.record.open > 0 ? ` · ${card.record.open} open` : ""}</span>
            </>
          ) : (
            <span className="type-body-strong text-ink-secondary">{S.card.noRecord(card.record.open)}</span>
          )}
        </div>
      </button>
      <div className="mt-auto flex flex-col gap-3">
        <p className="flex items-start gap-2 type-caption text-ink-secondary">
          <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", HEALTH_DOT[card.health.kind])} />
          <span className="line-clamp-2">
            <span className="text-ink">{S.health[card.health.kind]}</span>
            {card.health.why ? ` — ${card.health.why}` : ""}
          </span>
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="type-caption text-ink-secondary">{card.active ? S.card.perTrade(BigInt(card.envelope.maxStakePerTradeBase)) : S.card.closed}</span>
          <CopyToggle state={copying} copiers={card.subscribers} onCopy={onCopy} onStop={onStop} disabled={!card.active && copying === "none"} />
        </div>
      </div>
    </article>
  );
}
