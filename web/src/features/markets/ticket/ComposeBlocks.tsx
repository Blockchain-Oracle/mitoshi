"use client";
/**
 * The ticket's composing blocks (Ported from Masayume 68f7a09:web/src/features/markets/ticket/{BetModes,SideSegments,
 * AmountBlock,LeverageChips}.tsx): call a side or a band, the side as one tap-is-the-choice control, the amount as the
 * big figure (21st 16240's rolling amount field, outcome pills and quick adds) with the reference's additive `+1 +5 +20` chips (never a "Max" on a thin book), and the 1×/2×/3× chips.
 * Range and leverage stay where the reference puts them and say exactly what is missing until S10 deploys them.
 */
import type { Side } from "@cwf/core";
import { LEVERAGE_MULTIPLES } from "@cwf/core";
import { minStakeBase } from "@cwf/core/sizing";
import { formatBaseUnits, oneUnit } from "@cwf/core/units";
import { useId } from "react";
import { AmountField, OutcomePills, QuickAdds } from "@/components/ui/prediction-ticket";
import { TICKET, TICKET_PENDING } from "../copy";
import { SIDE_WORD, SIDES } from "../side-styles";

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

/** The side, as 16240's outcome pills: each side with its own live price (the two never add to $1, and say so nowhere). */
export function SideSegments({ side, onSelect, prices }: { side: Side | null; onSelect: (side: Side) => void; prices: Record<Side, string> }) {
  return <OutcomePills label={TICKET.sideLabel} value={side} onChange={onSelect} outcomes={SIDES.map((s) => ({ id: s, label: SIDE_WORD[s], price: prices[s] }))} />;
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
      <AmountField value={value} onChange={onChange} label={TICKET.amountAria("dollars")} describedBy={belowMin ? minId : undefined} placeholder={TICKET.stakePlaceholder} />
      {remembered && stakeBase > 0n ? <p className="tk-amount-min" role="status">{TICKET.remembered(usd(stakeBase))}</p> : null}
      <div className="tk-amount-row">
        <QuickAdds adds={STAKE_ADDS} onAdd={add} label={TICKET.chips} />
        <LeverageChips />
      </div>
      {belowMin && <p id={minId} className="tk-amount-min">{TICKET.minimum(usd(minStakeBase(decimals)))}</p>}
      <span className="sr-only" aria-live="polite">{costBase !== null ? TICKET.srCost(usd(costBase)) : ""}</span>
    </div>
  );
}
