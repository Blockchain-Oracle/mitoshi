"use client";
// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:web/src/features/vault/AmountField.tsx — an amount with a
// Max and a reason: the field says why when it asks for more than there is, so a button is never disabled without a
// word (E.5 S7 "partial withdraw with Max and inline reasons"). Masayume tokens, ≥ 16 px input, 44 px Max.
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { VAULT } from "./copy";

const usd = (base: bigint) => `$${formatBaseUnits(base, 6, { minDp: 2, maxDp: 2 })}`;

/** The one reason the amount can't go (null when it can, or when the field is empty). */
export function amountProblem(value: string, maxBase: bigint | null, over: (held: string) => string): string | null {
  if (value.trim() === "") return null;
  const base = parseDecimalToBaseUnits(value.trim(), 6);
  if (base === null) return VAULT.amount.notANumber;
  if (base === 0n) return VAULT.amount.zero;
  if (maxBase !== null && base > maxBase) return over(usd(maxBase));
  return null;
}

export interface AmountFieldProps {
  value: string;
  onChange: (text: string) => void;
  /** What can move; null while it is being read. */
  maxBase: bigint | null;
  label: string;
  /** The refusal for an amount over `maxBase`, given the max as text. */
  over: (held: string) => string;
  /** The hint under the field when there is no problem, given the max as text. */
  hint: (held: string) => string;
  disabled?: boolean;
  className?: string;
}

export function AmountField({ value, onChange, maxBase, label, over, hint, disabled, className }: AmountFieldProps) {
  const id = useId();
  const problem = amountProblem(value, maxBase, over);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="type-label-micro text-ink-secondary">{label}</label>
      <div className="relative flex items-center">
        <span aria-hidden className="pointer-events-none absolute left-3 type-body text-ink-secondary">$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-note`}
          placeholder="0.00"
          className={cn("numbers h-11 w-full rounded-md border bg-surface-1 pr-16 pl-7 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring", problem ? "border-warning" : "border-border-strong")}
        />
        <button type="button" disabled={disabled || maxBase === null || maxBase <= 0n} onClick={() => maxBase !== null && onChange(formatBaseUnits(maxBase, 6, { minDp: 0, maxDp: 6, group: false }))} className="absolute right-1 min-h-touch rounded-md px-3 type-caption font-semibold text-ink disabled:opacity-50">
          {VAULT.amount.max}
        </button>
      </div>
      <span id={`${id}-note`} role={problem ? "alert" : undefined} className={cn("type-caption", problem ? "text-ink" : "text-ink-secondary")}>
        {problem ?? (maxBase !== null ? hint(usd(maxBase)) : "—")}
      </span>
    </div>
  );
}
