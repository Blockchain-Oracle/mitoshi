"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/{CopyDrawer,CopyFormFields}.tsx — the drawer reads the
// strategy (what it does, its hard limits, its record, its runner, an agent's last reads) above a sticky action: the
// copy form (`planCopy`, one transaction) or, once copying, the copier's own result, switch follow ↔ fade, and stop.
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { CopyForm } from "./CopyForm";
import { COPY } from "./copy";
import { ManageCopy } from "./ManageCopy";
import type { StrategyWire } from "./protocol";
import type { CopyWrites } from "./useCopyWrites";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-hairline pt-4">
      <h3 className="type-label-micro text-ink-secondary">{title}</h3>
      {children}
    </section>
  );
}

const OUTCOME: Record<string, string> = { won: "won", lost: "lost", void: "void", open: "open" };

export function CopyDrawer({ card, strategies, writes, open, onOpenChange }: { card: StrategyWire | null; strategies: readonly StrategyWire[]; writes: CopyWrites; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!card) return null;
  const sub = writes.mine.find((m) => m.strategyId === card.strategyId && m.active) ?? null;
  const e = card.envelope;
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={COPY.drawerTitle(card.name)} description={card.envelope.seriesLabel ?? undefined}>
        <div className="flex flex-col gap-4 pb-4">
          {card.description && <p className="type-body text-ink">{card.description}</p>}
          <Section title={COPY.what}>
            <p className="type-body text-ink-secondary">{card.specText ?? card.description}</p>
          </Section>
          <Section title={COPY.limits}>
            <p className="type-body text-ink-secondary">{COPY.limitsLine(BigInt(e.maxStakePerTradeBase), BigInt(e.maxDailySpendBase), e.maxOpenPositions, BigInt(e.maxPriceRaw))}</p>
          </Section>
          <Section title={COPY.runner}>
            <p className="type-body text-ink-secondary">{card.health.why ?? "—"}</p>
            <p className="type-caption text-ink-muted">
              {COPY.runnerKey(card.runner)}
              {card.agentId ? ` · ${COPY.feedback(card.feedback.count, card.feedback.mean)}` : ""}
            </p>
          </Section>
          {card.agent && card.agent.decisions.length > 0 && (
            <Section title={COPY.agentReads}>
              <ul className="flex flex-col gap-2">
                {card.agent.decisions.slice(0, 4).map((d) => (
                  <li key={d.marketId} className="flex flex-col gap-0.5 rounded-md bg-surface-2 px-3 py-2">
                    <span className="type-caption text-ink">
                      {d.label ?? d.marketId.slice(0, 10)} · {d.side ? `bet ${d.side.toUpperCase()}` : "held"}
                      {d.outcome && d.side ? ` · ${OUTCOME[d.outcome]}` : ""}
                    </span>
                    <span className="type-caption text-ink-secondary">{d.why}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <div className="border-t border-hairline pt-4">
          {sub ? <ManageCopy card={card} strategies={strategies} sub={sub} writes={writes} /> : <CopyForm card={card} strategies={strategies} writes={writes} />}
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
