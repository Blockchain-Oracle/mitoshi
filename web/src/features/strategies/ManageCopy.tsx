"use client";
// The copier's side of the drawer (S9.7, plan fix 7: "the copier's own P&L panel"): whether the copy is live, what it has
// done for this wallet as the chain settled it, switch follow ↔ fade (no fee: already subscribed, D-219.3), and stop in
// one sponsored transaction (`stopIntent`: the grant is revoked only when no other copy shares it).
import { formatBaseUnits, USD_DECIMALS, type SubscriptionMode } from "@cwf/core";
import { useState } from "react";
import { Masked } from "@/components/kit";
import { TxFailureCard } from "@/components/tx";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { cn } from "@/lib/utils";
import { COPY } from "./copy";
import { CopyForm } from "./CopyForm";
import { stopIntent } from "./copy-plan";
import type { MinePayload, StrategyWire } from "./protocol";
import type { CopyWrites } from "./useCopyWrites";

export function ManageCopy({ card, strategies, sub, writes }: { card: StrategyWire; strategies: readonly StrategyWire[]; sub: MinePayload["subscriptions"][number]; writes: CopyWrites }) {
  const [said, setSaid] = useState<string | null>(null);
  const grant = writes.grant;
  const live = grant !== null && grant.grantId.toString() === sub.grantId && !grant.revoked && grant.expiresAtSec > Math.floor(Date.now() / 1000);
  const fills = writes.myFills.filter((f) => f.strategyId === card.strategyId);
  const settled = fills.filter((f) => f.pnlBase !== null);
  const net = settled.reduce((s, f) => s + BigInt(f.pnlBase!), 0n);
  const other: SubscriptionMode = sub.mode === "fade" ? "follow" : "fade";
  const sharing = writes.mine.some((m) => m.active && m.strategyId !== card.strategyId && m.grantId === sub.grantId);
  const busy = writes.tx.state.kind === "signing" || writes.tx.state.kind === "submitted";

  const act = async (intent: Parameters<CopyWrites["run"]>[0], ok: string) => {
    setSaid(null);
    const outcome = await writes.run(intent);
    if (outcome?.status === "confirmed") setSaid(ok);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("type-body-strong", live ? "text-profit" : "text-warning")}>{live ? COPY.manage.live : COPY.manage.notLive}</span>
        <span className="type-caption text-ink-secondary">{COPY.manage.mode(sub.mode)}</span>
      </div>
      <div className="flex flex-col gap-0.5 rounded-md bg-surface-2 px-3 py-2">
        <span className="type-label-micro text-ink-secondary">{COPY.manage.pnl}</span>
        {fills.length === 0 ? (
          <span className="type-body text-ink-secondary">{COPY.manage.noFills}</span>
        ) : (
          <span className={cn("type-body-strong tabular-nums", net > 0n ? "text-profit" : net < 0n ? "text-loss" : "text-ink")}>
            <Masked>{COPY.manage.pnlLine(net, settled.length, fills.length - settled.length)}</Masked>
          </span>
        )}
        {BigInt(sub.feesPaidBase) > 0n && <span className="type-caption text-ink-secondary"><Masked>Fee paid ${formatBaseUnits(BigInt(sub.feesPaidBase), USD_DECIMALS, { minDp: 2, maxDp: 2 })}</Masked></span>}
      </div>
      {!live && card.active && (
        <div className="flex flex-col gap-2">
          <span className="type-label-micro text-ink-secondary">{COPY.manage.renew}</span>
          <CopyForm card={card} strategies={strategies} writes={writes} />
        </div>
      )}
      {said && <p role="status" className="type-body-strong text-ink">{said}</p>}
      {writes.tx.state.kind === "failed" && <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} />}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy || !live}
          onClick={() => void act({ kind: "strategy-subscribe", strategyId: BigInt(card.strategyId), grantId: 0n, mode: other, maxFeeBase: 0n }, COPY.done.switched)}
          className="min-h-touch w-full rounded-full border border-hairline px-4 type-body-strong text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          {COPY.manage.switchTo(other)}
        </button>
        <span className="type-caption text-ink-secondary">{COPY.manage.switchHelp}</span>
      </div>
      <div className="flex flex-col gap-2">
        <HoldToConfirm disabled={busy} confirmLabel={COPY.manage.stopConfirm} onConfirm={() => void act(stopIntent(card.strategyId, writes.mine, grant), COPY.done.stopped)}>
          {COPY.manage.stop}
        </HoldToConfirm>
        <span className="type-caption text-ink-secondary">{COPY.manage.stopHelp(sharing)}</span>
      </div>
    </div>
  );
}
