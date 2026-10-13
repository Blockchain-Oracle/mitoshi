"use client";
// The drawer's "Your copy" tab (R4-6, D-227; Owarine 90a91d71 CopyDrawer's manage state): the copier's own result as one
// figure (its settled fills, as the chain settled them), live or paused, switch follow ↔ fade (free: already subscribed,
// D-219.3) and stop behind Hold to stop (`stopIntent`: the grant is revoked only when no other copy shares it). A paused
// copy renews through the same form as a new one, and can be stopped from here (its footer is the renewal).
import type { SubscriptionMode } from "@cwf/core";
import { useState } from "react";
import { Masked } from "@/components/kit";
import { notifyReceipt } from "@/features/receipts/write-receipt";
import { TxFailureCard } from "@/components/tx";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { StatusDot } from "@/components/kit/desk-kit";
import { cn } from "@/lib/utils";
import { COPY } from "./copy";
import { stopIntent } from "./copy-plan";
import { strategyIdentity } from "./identity";
import { usdSigned } from "./format";
import type { MinePayload, StrategyWire } from "./protocol";
import type { CopyWrites } from "./useCopyWrites";

type Sub = MinePayload["subscriptions"][number];
const M = COPY.manage;

/** Whether this copy's grant is the wallet's live one (not revoked, not expired). */
export function copyIsLive(sub: Sub, writes: Pick<CopyWrites, "grant">, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const g = writes.grant;
  return g !== null && g.grantId.toString() === sub.grantId && !g.revoked && g.expiresAtSec > nowSec;
}

export function ManageCopy({ card, sub, writes, renew, onStopped }: { card: StrategyWire; sub: Sub; writes: CopyWrites; renew: React.ReactNode; onStopped: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const live = copyIsLive(sub, writes);
  const fills = writes.myFills.filter((f) => f.strategyId === card.strategyId);
  const settled = fills.filter((f) => f.pnlBase !== null);
  const net = settled.reduce((s, f) => s + BigInt(f.pnlBase!), 0n);
  const other: SubscriptionMode = sub.mode === "fade" ? "follow" : "fade";
  const busy = writes.tx.state.kind === "signing" || writes.tx.state.kind === "submitted";
  const act = async (intent: Parameters<CopyWrites["run"]>[0], ok: string) => {
    setSaid(null);
    const outcome = await writes.run(intent);
    if (outcome?.status === "confirmed") {
      setSaid(ok);
      // The success receipt (R4-4, D-227; critic gap 21): what changed, for which strategy, and who signed it.
      notifyReceipt({ title: ok, figure: strategyIdentity(card).name, figureIsMoney: false, figureLabel: COPY.manage.receiptLabel, txHash: outcome.txHash, atMs: Date.now(), signer: writes.signer === "passkey" ? "passkey" : "wallet", sponsored: true });
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <StatusDot tone={live ? "live" : "warn"}>{live ? (sub.mode === "fade" ? M.fading : M.live) : M.notLive}</StatusDot>
        {BigInt(sub.feesPaidBase) > 0n && <span className="desk-note text-ink-muted"><Masked>{M.feePaid(BigInt(sub.feesPaidBase))}</Masked></span>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="desk-eyebrow text-ink/40">{M.pnl}</span>
        {fills.length === 0 ? (
          <span className="desk-note text-ink-secondary">{M.noFills}</span>
        ) : (
          <>
            <span className={cn("copy-manage-figure", net > 0n ? "text-profit" : net < 0n ? "text-loss" : "text-ink")}><Masked>{usdSigned(net)}</Masked></span>
            <span className="desk-note text-ink-muted">{M.sample(settled.length, fills.length - settled.length)}</span>
          </>
        )}
      </div>
      {!live && card.active && (
        <div className="flex flex-col gap-3">
          <span className="desk-eyebrow text-ink/40">{M.renew}</span>
          {renew}
        </div>
      )}
      {said && <p role="status" className="type-body-strong text-ink">{said}</p>}
      {writes.tx.state.kind === "failed" && <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} />}
      {live && (
        <button type="button" disabled={busy} className="strat-pause" onClick={() => void act({ kind: "strategy-subscribe", strategyId: BigInt(card.strategyId), grantId: 0n, mode: other, maxFeeBase: 0n }, COPY.done.switched)}>
          {M.switchTo(other)}
        </button>
      )}
      {/* A paused copy can still be ended (the footer carries its renewal, or nothing on a closed strategy). */}
      {!live && <StopCopy card={card} writes={writes} onStopped={onStopped} />}
    </div>
  );
}

/** The footer's stop: Hold to stop, never one tap. */
export function StopCopy({ card, writes, onStopped }: { card: StrategyWire; writes: CopyWrites; onStopped: () => void }) {
  const busy = writes.tx.state.kind === "signing" || writes.tx.state.kind === "submitted";
  return (
    <HoldToConfirm
      disabled={busy}
      confirmLabel={M.stopConfirm}
      onConfirm={() => void writes.run(stopIntent(card.strategyId, writes.mine, writes.grant)).then((o) => o?.status === "confirmed" && onStopped())}
    >
      {M.stop}
    </HoldToConfirm>
  );
}
