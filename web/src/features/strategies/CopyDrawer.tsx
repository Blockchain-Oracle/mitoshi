"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/CopyDrawer.tsx (R4-6, D-227) on Mitoshi's SlideOver: the
// portrait and name with the runner's state, one line on what it does, the record card, then tabs — Copy (or Your copy),
// Decisions · N for an agent, Memory when it has one. The action is pinned in the sheet's footer on every tab: Copy ·
// $10 (or Hold to stop on a live copy). The last card stays mounted until the close animation completes, so the sheet
// never snaps away. R4-2: `?d=copy` (Back closes it); it holds fields, so a phone sheet drags only from its grab bar.
import { useEffect, useState } from "react";
import { StatusDot, TabsPanel, UnderlineTabs } from "@/components/kit/desk-kit";
import { TxFailureCard } from "@/components/tx";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { notify } from "@/lib/toast";
import { AgentMemory } from "./AgentMemory";
import { AgentPortrait } from "./AgentPortrait";
import { COPY, STRATEGIES } from "./copy";
import { CopyCta, CopyForm, useCopyForm } from "./CopyForm";
import { oneLineOf, strategyIdentity } from "./identity";
import { copyIsLive, ManageCopy, StopCopy } from "./ManageCopy";
import { MemoryReader } from "./MemorySection";
import type { FillWire, StrategyWire } from "./protocol";
import { RecordCard } from "./RecordCard";
import { HEALTH_TONE } from "./StrategyCard";
import type { CopyWrites } from "./useCopyWrites";
import "./strategies.css";

export type DrawerTab = "copy" | "decisions" | "memory";

interface CopyDrawerProps {
  card: StrategyWire | null;
  strategies: readonly StrategyWire[];
  writes: CopyWrites;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** This strategy's fills (a decision's copies); the catalogue's latest when the page has no more. */
  fills?: readonly FillWire[];
  tab?: DrawerTab;
}

export function CopyDrawer({ card, strategies, writes, open, onOpenChange, fills = [], tab }: CopyDrawerProps) {
  // Keep the last card while the sheet closes; drop it once the exit has finished.
  const [shown, setShown] = useState<StrategyWire | null>(card);
  useEffect(() => {
    if (card) setShown(card);
  }, [card]);
  const c = card ?? shown;
  return (
    <SlideOver open={open && c !== null} onOpenChange={onOpenChange} urlKey="copy" onOpenChangeComplete={(o: boolean) => !o && setShown(null)}>
      {c && <DrawerBody key={c.strategyId} card={c} strategies={strategies} writes={writes} fills={fills.filter((f) => f.strategyId === c.strategyId)} initialTab={tab} onClose={() => onOpenChange(false)} />}
    </SlideOver>
  );
}

function DrawerBody({ card, strategies, writes, fills, initialTab, onClose }: { card: StrategyWire; strategies: readonly StrategyWire[]; writes: CopyWrites; fills: readonly FillWire[]; initialTab?: DrawerTab; onClose: () => void }) {
  const { name, seed } = strategyIdentity(card);
  const sub = writes.mine.find((m) => m.strategyId === card.strategyId && m.active) ?? null;
  const live = sub !== null && copyIsLive(sub, writes);
  const form = useCopyForm(card, strategies, writes);
  const [tab, setTab] = useState<DrawerTab>(initialTab ?? "copy");
  const e = card.envelope;
  const items = [
    { value: "copy" as const, label: sub ? COPY.tabs.yours : COPY.tabs.copy },
    ...(card.agent ? [{ value: "decisions" as const, label: COPY.tabs.decisions, count: card.agent.decisions.length }] : []),
    ...(card.memory ? [{ value: "memory" as const, label: COPY.tabs.memory }] : []),
  ];
  const done = (said: string) => {
    notify.item({ id: `copy-${card.strategyId}`, title: said });
    onClose();
  };
  const footer = live ? (
    <StopCopy card={card} writes={writes} onStopped={() => done(COPY.done.stopped)} />
  ) : card.active ? (
    <CopyCta card={card} form={form} writes={writes} onDone={() => done(COPY.done.copied)} />
  ) : null;

  return (
    <SlideOverContent title={name} hideHeading fields footer={footer}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex items-center gap-3">
          <AgentPortrait seed={seed} name={name} />
          <div className="min-w-0">
            <h2 className="strat-drawer-name">{name}</h2>
            <StatusDot tone={card.active ? HEALTH_TONE[card.health.kind] : "stopped"}>
              <span className="strat-meta text-ink-muted">{card.active ? STRATEGIES.health[card.health.kind] : STRATEGIES.card.closed} · {COPY.runner(card.runner)}</span>
            </StatusDot>
          </div>
        </div>
        <p className="strat-drawer-body line-clamp-2">{oneLineOf(card)}</p>
        <RecordCard record={card.record} />
        <p className="copy-limits">{COPY.limits(BigInt(e.maxStakePerTradeBase), BigInt(e.maxDailySpendBase), e.maxOpenPositions, BigInt(e.maxPriceRaw))}</p>
        <UnderlineTabs value={tab} onChange={setTab} items={items} label={COPY.tabsLabel}>
          <TabsPanel value="copy" className="pt-4">
            {writes.tx.state.kind === "failed" && !sub && <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} />}
            {sub ? (
              <ManageCopy card={card} sub={sub} writes={writes} renew={<CopyForm card={card} form={form} writes={writes} />} />
            ) : card.active ? (
              <CopyForm card={card} form={form} writes={writes} />
            ) : (
              <p className="desk-note text-ink-muted">{COPY.blocked.inactive}</p>
            )}
          </TabsPanel>
          {card.agent && (
            <TabsPanel value="decisions" className="pt-4">
              <AgentMemory decisions={card.agent.decisions} model={card.agent.model} agentName={name} fills={fills} />
            </TabsPanel>
          )}
          {card.memory && (
            <TabsPanel value="memory" className="pt-4">
              <MemoryReader card={card} wallet={writes.wallet} copying={sub !== null} onCopy={() => setTab("copy")} />
            </TabsPanel>
          )}
        </UnderlineTabs>
      </div>
    </SlideOverContent>
  );
}
