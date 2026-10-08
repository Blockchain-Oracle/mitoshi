"use client";
/**
 * The ticket's composing blocks (Ported from Masayume 68f7a09:web/src/features/markets/ticket/{BetModes,SideSegments,
 * AmountBlock,LeverageChips}.tsx): call a side or a band, the side as one tap-is-the-choice control, the amount as the
 * big figure (21st 16240's rolling amount field, outcome pills and quick adds) with the reference's additive `+1 +5 +20` chips (never a "Max" on a thin book), and the 1×/2×/3× chips.
 * Range and Boost are live (S10b/c: their bodies are `features/range/RangeTicketMode` and `features/boost/BoostTicketMode`).
 */
import type { Side } from "@cwf/core";
import { minStakeBase } from "@cwf/core/sizing";
import { formatBaseUnits, oneUnit } from "@cwf/core/units";
import { useId } from "react";
import { AmountField, OutcomePills, QuickAdds } from "@/components/ui/prediction-ticket";
import { TICKET, TICKET_PENDING } from "../copy";
import { SIDE_WORD, SIDES } from "../side-styles";

export const STAKE_ADDS = [1, 5, 20] as const;

export type BetMode = "direction" | "range" | "boost";

/** Up/Down or Range (S10b: the Range mode prices a band against the RangeReserve on this Window). */
export function BetModes({ mode, onMode }: { mode: BetMode; onMode: (mode: BetMode) => void }) {
  return (
    <div className="tk-modes" role="group" aria-label={TICKET_PENDING.modeLabel}>
      <button type="button" className="tk-mode min-h-touch" aria-pressed={mode === "direction"} onClick={() => onMode("direction")}>{TICKET_PENDING.modeDirection}</button>
      <button type="button" className="tk-mode min-h-touch" aria-pressed={mode === "range"} onClick={() => onMode("range")}>{TICKET_PENDING.modeRange}</button>
      <button type="button" className="tk-mode min-h-touch" aria-pressed={mode === "boost"} onClick={() => onMode("boost")}>{TICKET_PENDING.modeBoost}</button>
    </div>
  );
}

/** The reference's Public/Private control (Masayume `Ticket624Drawer.tsx` L1175–1247), on Up/Down only: Private places the
 *  same bet at 1× through the desk from the private balance (S10d, D-171). */
export function RouteToggle({ route, onRoute }: { route: "public" | "private"; onRoute: (route: "public" | "private") => void }) {
  return (
    <div className="tk-modes tk-route" role="group" aria-label={TICKET_PENDING.routeLabel}>
      <button type="button" className="tk-mode min-h-touch" aria-pressed={route === "public"} onClick={() => onRoute("public")}>{TICKET_PENDING.routePublic}</button>
      <button type="button" className="tk-mode tk-mode--private min-h-touch" aria-pressed={route === "private"} onClick={() => onRoute("private")}>{TICKET_PENDING.routePrivate}</button>
    </div>
  );
}

/** The side, as 16240's outcome pills: each side with its own live price (the two never add to $1, and say so nowhere). */
export function SideSegments({ side, onSelect, prices }: { side: Side | null; onSelect: (side: Side) => void; prices: Record<Side, string> }) {
  return <OutcomePills label={TICKET.sideLabel} value={side} onChange={onSelect} outcomes={SIDES.map((s) => ({ id: s, label: SIDE_WORD[s], price: prices[s] }))} />;
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
      </div>
      {belowMin && <p id={minId} className="tk-amount-min">{TICKET.minimum(usd(minStakeBase(decimals)))}</p>}
      <span className="sr-only" aria-live="polite">{costBase !== null ? TICKET.srCost(usd(costBase)) : ""}</span>
    </div>
  );
}
