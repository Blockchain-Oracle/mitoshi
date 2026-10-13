"use client";
// A theme's follow sheet (S16; R6, D-230; D-231) — the strategies desk's copy flow in the theme's own head: following a
// basket is copying its strategy, so it is the same one self-paid transaction (`planCopy`: a STRATEGY grant to the house
// runner — with a deposit when the Trading Balance is short — the fee's exact approval and `subscribe`), Follow or Fade,
// Budget and Biggest call with their Max chips, the plan as rows, and the one action pinned in the footer (sign-in at
// the end for a signed-out visitor, D-224). Once following, "Your copy" (its result, switch follow ↔ fade, top up) with
// Hold to stop (sponsored). Every call the runner then places is sized by its stock's weight of the per-trade cap the
// copier set. No key is issued, no share is bought: the runner places calls through the grant, inside its caps.
import { useEffect, useState } from "react";
import { TxFailureCard } from "@/components/tx";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { notify } from "@/lib/toast";
import { COPY } from "@/features/strategies/copy";
import { CopyCta, CopyForm, useCopyForm } from "@/features/strategies/CopyForm";
import { copyIsLive, ManageCopy, StopCopy } from "@/features/strategies/ManageCopy";
import type { StrategyWire } from "@/features/strategies/protocol";
import { useCopyWrites, type CopyWrites } from "@/features/strategies/useCopyWrites";
import { useStrategies } from "@/features/strategies/useStrategies";
import { LogoStack } from "@/components/kit/desk-kit/charts";
import "@/components/kit/desk-kit/desk-kit.css";
import "@/features/strategies/strategies.css";
import { THEMES } from "./copy";
import { useThemesRefresh } from "./live";
import "@/styles/themes-detail.css";

const F = THEMES.follow;

export interface FollowSheetProps {
  card: StrategyWire;
  name: string;
  symbols: string[];
  /** "in 14h 20m" while a market-hours theme's market is closed; null when it calls now. */
  opensIn: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FollowSheet({ card, name, symbols, opensIn, open, onOpenChange }: FollowSheetProps) {
  const writes = useCopyWrites();
  const catalogue = useStrategies();
  const refresh = useThemesRefresh();
  // The plan carries the wallet's other copies on the same runner by name; the desk's catalogue has them all.
  const strategies = catalogue.data?.strategies.some((s) => s.strategyId === card.strategyId) ? catalogue.data.strategies : [card, ...(catalogue.data?.strategies ?? [])];
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) setShown(true);
  }, [open]);
  const done = (said: string) => {
    notify.item({ id: `theme-${card.strategyId}`, title: said });
    void refresh();
    onOpenChange(false);
  };
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} urlKey="follow" onOpenChangeComplete={(o: boolean) => !o && setShown(false)}>
      {shown ? <Body card={card} name={name} symbols={symbols} opensIn={opensIn} strategies={strategies} writes={writes} onDone={done} /> : null}
    </SlideOver>
  );
}

function Body({ card, name, symbols, opensIn, strategies, writes, onDone }: { card: StrategyWire; name: string; symbols: string[]; opensIn: string | null; strategies: readonly StrategyWire[]; writes: CopyWrites; onDone: (said: string) => void }) {
  const sub = writes.mine.find((m) => m.strategyId === card.strategyId && m.active) ?? null;
  const live = sub !== null && copyIsLive(sub, writes);
  const copy = useCopyForm(card, strategies, writes);
  // Following a theme is copying its strategy; the action says Follow (a fade keeps its own word).
  const form = { ...copy, cta: copy.mode === "follow" ? copy.cta.replace(/^Copy/, THEMES.card.follow) : copy.cta };
  const footer = live ? (
    <StopCopy card={card} writes={writes} onStopped={() => onDone(COPY.done.stopped)} />
  ) : card.active ? (
    <CopyCta card={card} form={form} writes={writes} onDone={() => onDone(COPY.done.copied)} />
  ) : null;
  return (
    <SlideOverContent title={F.title(name)} hideHeading fields footer={footer}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="th-sheet-head">
          <LogoStack symbols={symbols} max={4} size="md" />
          <h2 className="th-sheet-name">{name}</h2>
        </div>
        <p className="th-sheet-line">{THEMES.theme.followLine}{opensIn ? ` ${F.closedHint(opensIn)}` : ""}</p>
        {writes.tx.state.kind === "failed" && !sub ? <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} /> : null}
        {sub ? (
          <ManageCopy card={card} sub={sub} writes={writes} renew={<CopyForm card={card} form={form} writes={writes} />} onStopped={() => onDone(COPY.done.stopped)} />
        ) : card.active ? (
          <CopyForm card={card} form={form} writes={writes} />
        ) : (
          <p className="desk-note text-ink-muted">{COPY.blocked.inactive}</p>
        )}
      </div>
    </SlideOverContent>
  );
}
