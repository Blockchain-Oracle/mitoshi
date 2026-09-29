"use client";
/**
 * The ticket's composing blocks (Ported from Masayume 68f7a09:web/src/features/markets/ticket/{BetModes,SideSegments,
 * AmountBlock,LeverageChips}.tsx): call a side or a band, the side as one tap-is-the-choice control, the amount as the
 * big figure with the reference's additive `+1 +5 +20` chips (never a "Max" on a thin book), and the 1×/2×/3× chips.
 * Range and leverage stay where the reference puts them and say exactly what is missing until S10 deploys them.
 */
import type { Side } from "@cwf/core";
import { LEVERAGE_MULTIPLES } from "@cwf/core";
import { minStakeBase } from "@cwf/core/sizing";
import { formatBaseUnits, oneUnit } from "@cwf/core/units";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TICKET, TICKET_PENDING } from "../copy";
import { SIDE_CLASSES, SIDE_WORD, SIDES } from "../side-styles";

export const STAKE_ADDS = [1, 5, 20] as const;

export function BetModes() {
  return (
    <div className="tk-modes" role="group" aria-label={TICKET_PENDING.modeLabel}>
      <button type="button" className="tk-mode" aria-pressed>{TICKET_PENDING.modeDirection}</button>
      <button type="button" className="tk-mode" aria-pressed={false} disabled title={TICKET_PENDING.rangePending} aria-label={`${TICKET_PENDING.modeRange} — ${TICKET_PENDING.rangePending}`}>
        {TICKET_PENDING.modeRange}
      </button>
    </div>
  );
}

export function SideSegments({ side, onSelect }: { side: Side | null; onSelect: (side: Side) => void }) {
  return (
    <div role="radiogroup" aria-label={TICKET.sideLabel} className="grid grid-cols-2 gap-2">
      {SIDES.map((option) => (
        <Button key={option} role="radio" aria-checked={side === option} aria-pressed={side === option} variant="outline" size="lg" onClick={() => onSelect(option)} className={cn("min-h-touch type-body-strong", SIDE_CLASSES[option])}>
          {SIDE_WORD[option]}
        </Button>
      ))}
    </div>
  );
}

function sanitize(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

export function LeverageChips() {
  return (
    <div className="tk-levs" role="group" aria-label={TICKET_PENDING.leverageLabel}>
      <span className="tk-control-label tk-levs-label" aria-hidden>{TICKET_PENDING.leverageLabel}</span>
      {LEVERAGE_MULTIPLES.map((multiple) => {
        const label = `${multiple}×`;
        const reason = multiple === 1 ? null : TICKET_PENDING.leveragePending(label);
        return (
          <button key={multiple} type="button" className="tk-lev" aria-pressed={multiple === 1} disabled={reason !== null} title={reason ?? undefined} aria-label={reason ? `${label} — ${reason}` : label}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export interface AmountBlockProps {
  value: string;
  onChange: (text: string) => void;
  stakeBase: bigint;
  onStakeBase: (base: bigint) => void;
  balanceBase: bigint | null;
  decimals: number;
  belowMin: boolean;
  remembered: boolean;
  costBase: bigint | null;
}

export function AmountBlock({ value, onChange, stakeBase, onStakeBase, balanceBase, decimals, belowMin, remembered, costBase }: AmountBlockProps) {
  const minId = useId();
  const add = (units: number) => onStakeBase(stakeBase + BigInt(units) * oneUnit(decimals));
  const usd = (base: bigint) => `$${formatBaseUnits(base, decimals, { minDp: 2, maxDp: 2 })}`;
  return (
    <div className="tk-amount">
      <div className="tk-amount-head">
        <span className="tk-amount-label">{TICKET.amount}</span>
        {balanceBase !== null && <span className="tk-amount-balance">{TICKET.balance(usd(balanceBase))}</span>}
      </div>
      <div className="tk-amount-field">
        <span className="tk-amount-unit">$</span>
        <input inputMode="decimal" autoComplete="off" placeholder={TICKET.stakePlaceholder} value={value} onChange={(e) => onChange(sanitize(e.target.value))} className="tk-amount-input" aria-label={TICKET.amountAria("dollars")} aria-describedby={belowMin ? minId : undefined} />
      </div>
      {remembered && stakeBase > 0n ? <p className="tk-amount-min" role="status">{TICKET.remembered(usd(stakeBase))}</p> : null}
      <div className="tk-amount-row">
        <div className="tk-adds" role="group" aria-label={TICKET.chips}>
          {STAKE_ADDS.map((units) => (
            <button key={units} type="button" className="tk-add min-h-touch" onClick={() => add(units)}>+{units}</button>
          ))}
        </div>
        <LeverageChips />
      </div>
      {belowMin && <p id={minId} className="tk-amount-min">{TICKET.minimum(usd(minStakeBase(decimals)))}</p>}
      <span className="sr-only" aria-live="polite">{costBase !== null ? TICKET.srCost(usd(costBase)) : ""}</span>
    </div>
  );
}
