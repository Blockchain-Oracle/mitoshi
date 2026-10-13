"use client";
/**
 * The ticket's composing blocks (Ported from Owarine 90a91d71:web/src/features/markets/ticket/{BetModes,SideSegments,
 * AmountBlock,LeverageChips,PublicPrivate}.tsx, R4-3 D-227; first ported from Masayume 68f7a09): call a side or a band;
 * the side as two outline segments with the live cents; the amount as one bordered block — the label and balance, the
 * display figure with its unit, then one row with the additive `+1 +5 +20` (never a "Max" on a thin book) on the left and
 * the 1×/2×/3× chips on the right. Boost is a chip, not a mode: 2×/3× change the strip's numbers and the CTA, never the
 * ticket's shape. Public/Private sits right before the CTA, as Owarine places it.
 */
import type { Side } from "@cwf/core";
import { minStakeBase } from "@cwf/core/sizing";
import { formatBaseUnits, oneUnit } from "@cwf/core/units";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TICKET, TICKET_PENDING } from "../copy";
import { SIDE_CLASSES, SIDE_WORD, SIDES } from "../side-styles";

export const STAKE_ADDS = [1, 5, 20] as const;
export const LEVERAGE_MULTIPLES = [1, 2, 3] as const;

export type BetMode = "direction" | "range";

/** Up/Down or Range (S10b: the Range mode prices a band against the RangeReserve on this Window). */
export function BetModes({ mode, onMode }: { mode: BetMode; onMode: (mode: BetMode) => void }) {
  return (
    <div className="tk-modes" role="group" aria-label={TICKET_PENDING.modeLabel}>
      <button type="button" className="tk-mode" aria-pressed={mode === "direction"} onClick={() => onMode("direction")}>{TICKET_PENDING.modeDirection}</button>
      <button type="button" className="tk-mode" aria-pressed={mode === "range"} onClick={() => onMode("range")}>{TICKET_PENDING.modeRange}</button>
    </div>
  );
}

/** Tap-is-the-choice: the two sides as one control, each with its live price; the word never leaves the wash. */
export function SideSegments({ side, onSelect, prices }: { side: Side | null; onSelect: (side: Side) => void; prices: Record<Side, string> }) {
  return (
    <div role="radiogroup" aria-label={TICKET.sideLabel} className="grid grid-cols-2 gap-2">
      {SIDES.map((option) => (
        <Button
          key={option}
          role="radio"
          aria-checked={side === option}
          aria-pressed={side === option}
          variant="outline"
          size="lg"
          onClick={() => onSelect(option)}
          className={cn("tk-side type-body-strong", SIDE_CLASSES[option])}
        >
          {SIDE_WORD[option]}
          <span className="price numbers">{prices[option]}</span>
        </Button>
      ))}
    </div>
  );
}

export interface LeverageChipsProps {
  value: number;
  onChange: (multiple: number) => void;
  /** The reserve's own ceiling, in multiples; null until read. */
  maxMultiple: number | null;
  /** Why 2×/3× can't be chosen here (a listed Window, a private bet); null when they can. */
  lockedReason: string | null;
}

/** Owarine's 1×/2×/3× chips: 1× is the plain order, a higher multiple is a Boost the reserve fronts. */
export function LeverageChips({ value, onChange, maxMultiple, lockedReason }: LeverageChipsProps) {
  return (
    <div className="tk-levs" role="group" aria-label={TICKET_PENDING.leverageLabel}>
      <span className="tk-control-label tk-levs-label" aria-hidden>{TICKET_PENDING.leverageLabel}</span>
      {LEVERAGE_MULTIPLES.map((multiple) => {
        const label = `${multiple}×`;
        const reason = multiple === 1 ? null : (lockedReason ?? (maxMultiple !== null && multiple > maxMultiple ? TICKET_PENDING.leverageCapped(label, `${maxMultiple}×`) : null));
        return (
          <button key={multiple} type="button" className="tk-lev" aria-pressed={value === multiple} disabled={reason !== null} title={reason ?? (multiple > 1 ? TICKET_PENDING.boostHint : undefined)} onClick={() => onChange(multiple)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Keeps only digits and a single decimal point; the parser downstream rejects anything else anyway. */
function sanitize(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
}

export interface AmountBlockProps {
  value: string;
  onChange: (text: string) => void;
  stakeBase: bigint;
  onStakeBase: (base: bigint) => void;
  balanceBase: bigint | null;
  decimals: number;
  belowMin: boolean;
  /** The 1×/2×/3× chips on the row's right; null on a band, which places at 1× only. */
  leverage: LeverageChipsProps | null;
  costBase: bigint | null;
}

export function AmountBlock({ value, onChange, stakeBase, onStakeBase, balanceBase, decimals, belowMin, leverage, costBase }: AmountBlockProps) {
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
        <input
          inputMode="decimal"
          autoComplete="off"
          placeholder={TICKET.stakePlaceholder}
          value={value}
          onChange={(event) => onChange(sanitize(event.target.value))}
          className="tk-amount-input"
          aria-label={TICKET.amountAria("dollars")}
          aria-describedby={belowMin ? minId : undefined}
        />
        <span className="tk-amount-unit">{TICKET.unit}</span>
      </div>
      <div className="tk-amount-row">
        <div className="tk-adds" role="group" aria-label={TICKET.chips}>
          {STAKE_ADDS.map((units) => (
            <button key={units} type="button" className="tk-add" onClick={() => add(units)}>+{units}</button>
          ))}
        </div>
        {leverage && <LeverageChips {...leverage} />}
      </div>
      {belowMin && <p id={minId} className="tk-amount-min">{TICKET.minimum(usd(minStakeBase(decimals)))}</p>}
      <span className="sr-only" aria-live="polite">{costBase !== null ? TICKET.srCost(usd(costBase)) : ""}</span>
    </div>
  );
}

/** Public ⟷ Private (Owarine `PublicPrivate`): two tiles in a bordered tray. Private places the same bet at 1× through
 *  the desk from the private balance (S10d, D-171). */
export function RouteToggle({ route, onRoute }: { route: "public" | "private"; onRoute: (route: "public" | "private") => void }) {
  return (
    <div className="tk-pp-row">
      <div className="tk-pp" role="group" aria-label={TICKET_PENDING.routeLabel}>
        <button type="button" className="tk-pp-btn" aria-pressed={route === "public"} onClick={() => onRoute("public")}>{TICKET_PENDING.routePublic}</button>
        <button type="button" className="tk-pp-btn tk-pp-btn--private" aria-pressed={route === "private"} onClick={() => onRoute("private")}>{TICKET_PENDING.routePrivate}</button>
      </div>
    </div>
  );
}
