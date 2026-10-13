"use client";
// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:web/src/features/vault/AmountField.tsx, reskinned to Owarine
// 90a91d71:web/src/features/vault/AmountField.tsx (R4-4, D-227) — one pill field with Max inside it and a reason under
// it: the field says why when it asks for more than there is, so a button is never disabled without a word. Shared by
// the Trading Balance and the private balance (both move in and out of the one field). ≥ 16 px input, 36 px Max on a
// 44 px hit area. Styles in styles/vault.css.
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { VAULT } from "./copy";

const usd = (base: bigint) => `$${formatBaseUnits(base, 6, { minDp: 2, maxDp: 2 })}`;

/** The one reason the amount can't go (null when it can, or when the field is empty). */
/** `mask` (privacy mode's dots) stands in for the held figure, so a refusal never prints what the account holds. */
export function amountProblem(value: string, maxBase: bigint | null, over: (held: string) => string, mask?: string): string | null {
  if (value.trim() === "") return null;
  const base = parseDecimalToBaseUnits(value.trim(), 6);
  if (base === null) return VAULT.amount.notANumber;
  if (base === 0n) return VAULT.amount.zero;
  if (maxBase !== null && base > maxBase) return over(mask ?? usd(maxBase));
  return null;
}

export interface AmountFieldProps {
  value: string;
  onChange: (text: string) => void;
  /** What Max fills in; null while it is being read. */
  maxBase: bigint | null;
  /** The field's accessible name. */
  label: string;
  /** The refusal to show in place of the hint (from `amountProblem`), or null. */
  problem: string | null;
  /** The one line under the field when nothing is wrong. */
  hint: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function AmountField({ value, onChange, maxBase, label, problem, hint, disabled, className }: AmountFieldProps) {
  const id = useId();
  return (
    <div className={cn("vault-amount", className)} data-invalid={problem ? "" : undefined}>
      <div className="vault-amount-row">
        <span aria-hidden className="vault-amount-symbol">$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          aria-label={label}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-note`}
          placeholder="0.00"
          className="vault-input numbers"
        />
        <button type="button" className="vault-max" disabled={disabled || maxBase === null || maxBase <= 0n} onClick={() => maxBase !== null && onChange(formatBaseUnits(maxBase, 6, { minDp: 0, maxDp: 6, group: false }))}>
          {VAULT.amount.max}
        </button>
      </div>
      <span id={`${id}-note`} role={problem ? "alert" : undefined} className={problem ? "vault-amount-problem" : "vault-amount-hint"}>
        {problem ?? hint}
      </span>
    </div>
  );
}
