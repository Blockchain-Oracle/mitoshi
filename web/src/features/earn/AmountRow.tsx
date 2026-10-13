"use client";
/**
 * The amount on the earn action card (R4-7, D-227) — Mitoshi's vault `AmountField` (ported from Agari
 * 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:web/src/features/vault/AmountField.tsx) on Owarine 90a91d71's vault field
 * (`vault.css` `.vault-max`: Max inside the pill, the reason line in the loss tone), one figure line instead of a label
 * above it. In the phone sheet the field is the kit Keypad's display (no OS keyboard over the footer's button), else a
 * text field. The reason is `amountProblem`'s, so the field and the button never disagree.
 */
import { DOLLAR_KEYPAD } from "@cwf/core/input";
import { formatBaseUnits } from "@cwf/core/units";
import { useId } from "react";
import { Keypad } from "@/components/kit/Keypad";
import { amountProblem } from "@/features/vault/AmountField";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { EARN } from "./copy";
import { DECIMALS } from "./format";
import "@/components/kit/kit.css";

export interface AmountRowProps {
  value: string;
  onChange: (text: string) => void;
  /** What can move; null while it is being read or when there is no account yet (Max is off, no hint). */
  maxBase: bigint | null;
  label: string;
  over: (max: string) => string;
  hint: (max: string) => string;
  /** The phone sheet: the kit Keypad drives a display, not a text field. */
  keypad?: boolean;
  /** Max was tapped (after `onChange` has the figure): a withdraw then sends exactly the idle shares, whatever the field rounds to. */
  onMax?: () => void;
}

const usd = (base: bigint) => `$${formatBaseUnits(base, DECIMALS, { minDp: 2, maxDp: 2 })}`;

export function AmountRow({ value, onChange, maxBase, label, over, hint, keypad = false, onMax }: AmountRowProps) {
  const id = useId();
  // Privacy mode (the balance eye): the hint and the refusal name the account's figure as the dots.
  const mask = usePrivacy() ? SHELL.masked : undefined;
  const problem = amountProblem(value, maxBase, over, mask);
  const fill = () => {
    if (maxBase === null) return;
    onChange(formatBaseUnits(maxBase, DECIMALS, { minDp: 0, maxDp: keypad ? DOLLAR_KEYPAD.maxDecimals : DECIMALS, group: false }));
    onMax?.();
  };
  return (
    <div className="ea-amount">
      <div className="ea-amount-pill" data-problem={problem ? "" : undefined}>
        <span aria-hidden className="ea-amount-unit">$</span>
        {keypad ? (
          <output id={id} aria-label={label} className="ea-amount-input numbers" data-empty={value === "" ? "" : undefined}>
            {value === "" ? "0" : value}
          </output>
        ) : (
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
            aria-label={label}
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${id}-note`}
            placeholder="0.00"
            className="ea-amount-input numbers"
          />
        )}
        <button type="button" className="ea-amount-max" disabled={maxBase === null || maxBase <= 0n} onClick={fill}>
          {EARN.supply.max}
        </button>
      </div>
      <span id={`${id}-note`} role={problem ? "alert" : undefined} className="ea-amount-note" data-problem={problem ? "" : undefined}>
        {problem ?? (maxBase !== null ? hint(mask ?? usd(maxBase)) : " ")}
      </span>
      {keypad ? <Keypad value={value} onChange={onChange} rules={DOLLAR_KEYPAD} labels={EARN.pad} className="ea-keypad" /> : null}
    </div>
  );
}
