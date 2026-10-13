"use client";
/**
 * The ticket's reading and acting blocks (Ported from Masayume 68f7a09:web/src/features/markets/ticket/{ReadoutStrip,
 * AccountGate,OutcomeNote,TicketCta}.tsx): Current cost · Return · Max loss in three columns with one caption; the
 * account gates inline (sign in; "Top up to place this" with Add money right there; the tap-trading chip); every
 * outcome from the receipt (a revert is never shown as success; "nothing filled" says the stake was never taken); and
 * the CTA whose label IS the blocker, then the lifecycle's own named waits (D-052).
 */
import type { OrderOutcome, Side, TxState } from "@cwf/core";
import { blockerLabel, SUBMITTED_UNKNOWN, type BlockerContext, type BlockerKind } from "@cwf/core/copy";
import { formatBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import type { ReactNode } from "react";
import { Hash } from "@/components/data";
import { TxCta, TxFailureCard, type SignerKind } from "@/components/tx";
import { SHELL } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { openFunds } from "@/lib/funds-event";
import { usePrivacy } from "@/lib/privacy";
import { TICKET } from "../copy";
import { SIDE_WORD } from "../side-styles";

export interface ReadoutCells {
  cost: string | null;
  ret: string | null;
  loss: string | null;
}

export function ReadoutStrip({ cells, live, caption, chance, note = null }: { cells: ReadoutCells; live: boolean; caption: string; chance: string | null; note?: string | null }) {
  const cell = (label: string, value: string | null, accent = false) => (
    <div className="tk-readout-cell">
      <span className="tk-readout-label">{label}</span>
      <span className={`tk-readout-value${accent ? " tk-readout-value--accent" : ""}`}>{value ?? "—"}</span>
    </div>
  );
  return (
    <>
      <div className={`tk-readout${live ? " tk-readout--live" : ""}`}>
        {cell(TICKET.currentCost, cells.cost)}
        {cell(TICKET.ret, cells.ret, cells.ret !== null)}
        {cell(TICKET.maxLoss, cells.loss)}
      </div>
      <div className="tk-caption" aria-live="polite">
        <span>{caption}</span>
        {chance && <span className="tk-caption-chance">{chance}</span>}
      </div>
      {/* Owarine's strip note: a Boost's knock-out line (R4-3, D-227). */}
      {note && <p className="tk-note">{note}</p>}
    </>
  );
}

/** The top-up gate and the tap-trading chip. No sign-in wall here: signed out, the CTA itself opens sign-in for the order (D-224). */
export function AccountGate({ connected, availableBase, stakeBase, decimals, chip }: { connected: boolean; availableBase: bigint | null; stakeBase: bigint; decimals: number; chip: ReactNode }) {
  // Privacy mode (the balance eye): what the account holds — and the shortfall, which gives it away — are the dots.
  const hidden = usePrivacy();
  const usd = (b: bigint) => (hidden ? SHELL.masked : `$${formatBaseUnits(b, decimals, { minDp: 2, maxDp: 2 })}`);
  const short = connected && availableBase !== null && (availableBase === 0n || (stakeBase > 0n && stakeBase > availableBase));
  const needBase = availableBase !== null && stakeBase > availableBase ? stakeBase - availableBase : null;
  return (
    <>
      {short && (
        <div className="tk-gate tk-gate--warn" role="status">
          <div className="tk-gate-eyebrow">{TICKET.gate.topUp}</div>
          <p className="tk-gate-line">
            {TICKET.gate.holds(usd(availableBase ?? 0n))} {needBase !== null ? TICKET.gate.need(usd(needBase)) : TICKET.gate.empty}
          </p>
          <div className="tk-gate-actions">
            <button type="button" className="tk-gate-cta min-h-touch" onClick={openFunds}>{TICKET.gate.addMoney}</button>
          </div>
        </div>
      )}
      {connected && chip ? <div className="tk-gate-row"><span />{chip}</div> : null}
    </>
  );
}

function Line({ children, txHash }: { children: ReactNode; txHash?: `0x${string}` | null }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-2 type-caption text-ink">
      <span>{children}</span>
      {txHash && (
        <span className="text-ink-secondary">
          {TICKET.txLabel} <Hash value={txHash} href={txUrl(txHash, webEnv.markets.network)} className="text-ink" />
        </span>
      )}
    </p>
  );
}

export function OutcomeNote({ tx, outcome, decimals, onDismiss }: { tx: TxState; outcome: OrderOutcome | null; decimals: number; onDismiss: () => void }) {
  const usd = (b: bigint) => `$${formatBaseUnits(b, decimals, { minDp: 2, maxDp: 2 })}`;
  if (tx.kind === "failed") return <TxFailureCard state={tx} onRetry={onDismiss} explorerHref={tx.txHash ? txUrl(tx.txHash, webEnv.markets.network) : null} />;
  if (tx.kind === "unknown") return <Line txHash={tx.txHash}>{SUBMITTED_UNKNOWN}</Line>;
  if (!outcome) return null;
  switch (outcome.status) {
    case "nothingFilled":
      return <Line txHash={outcome.txHash}>{TICKET.nothingFilled}</Line>;
    case "requote":
      return <Line>{TICKET.requotePrefix} {usd(outcome.quote.maxCostBase)}. {TICKET.requoteSuffix}</Line>;
    default:
      return null;
  }
}

export interface TicketCtaProps {
  blocker: BlockerKind | null;
  ctx: BlockerContext;
  tx: TxState;
  side: Side | null;
  costBase: bigint | null;
  decimals: number;
  signer: SignerKind;
  onConfirm: () => void;
  action?: (side: string) => string;
}

export function TicketCta({ blocker, ctx, tx, side, costBase, decimals, signer, onConfirm, action = TICKET.buy }: TicketCtaProps) {
  const busy = tx.kind === "signing" || tx.kind === "submitted" || tx.kind === "unknown";
  const label = side && costBase !== null ? `${action(SIDE_WORD[side])} $${formatBaseUnits(costBase, decimals, { minDp: 2, maxDp: 2 })}` : TICKET.buyPlain;
  // A blocker names itself; while a write runs, the lifecycle's words do (never a bare spinner).
  const state: TxState = busy ? tx : blocker && blocker !== "placing" ? { kind: "blocked", reason: blockerLabel(blocker, ctx) } : tx.kind === "failed" || tx.kind === "confirmed" ? { kind: "idle" } : tx;
  return <TxCta state={state} action={label} signer={signer} sponsored onConfirm={onConfirm} tone={side ?? "accent"} />;
}
