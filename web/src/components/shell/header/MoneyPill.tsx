"use client";
// The header money pill (Masayume 68f7a09 HeaderMoneyPill): pathUSD (+ the Trading Balance once it exists), a `+` that
// opens Add money, and "never show a half-loaded sum". Split out of HeaderAccount so its balance read (TanStack Query)
// loads with the signed-in session, not in every page's first load (§3.1).
import type { Address } from "@cwf/core";
import { useBalanceSheet } from "@cwf/markets/react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { SHELL } from "@/lib/copy";
import { openFunds } from "@/lib/funds-event";
import { setPrivacy, usePrivacy } from "@/lib/privacy";
import { dollars } from "@/providers/wallet/format";
import { useDemoState } from "@/features/terminal/demo";

export function MoneyPill({ address, variant = "bar" }: { address: Address; variant?: "rail" | "bar" }) {
  const sheet = useBalanceSheet(address);
  const value = sheet?.ok ? sheet.value : null;
  const total = value ? value.spendableBase + (value.vaultBase ?? 0n) : null;
  return variant === "rail" ? <MoneyTile total={total} /> : <MoneyPillView total={total} />;
}

/**
 * The full rail's money (Owarine 90a91d71 `BalanceChip variant="rail"`; O-10, D-222): a filled tile at the rail's foot —
 * what the money is, the privacy eye, the sum large, and the solid + that opens Add money.
 */
export function MoneyTile({ total, label = SHELL.moneyLabel, onAdd = openFunds }: { total: bigint | null; label?: string; onAdd?: (() => void) | null }) {
  const hidden = usePrivacy();
  return (
    <div className="money-tile">
      <div className="money-tile-head">
        <span className="money-tile-label">{label}</span>
        <button type="button" className="money-tile-eye" aria-pressed={hidden} aria-label={hidden ? SHELL.privacyShow : SHELL.privacyHide} title={hidden ? SHELL.privacyShow : SHELL.privacyHide} onClick={() => setPrivacy(!hidden)}>
          {hidden ? <EyeOff aria-hidden className="size-3.5" /> : <Eye aria-hidden className="size-3.5" />}
        </button>
      </div>
      <div className="money-tile-row">
        <span className={`money-tile-sum numbers${total === null && !hidden ? " is-dim" : ""}`}>{hidden ? SHELL.masked : dollars(total)}</span>
        {onAdd ? (
          <button type="button" onClick={onAdd} aria-label={SHELL.addMoney} title={SHELL.addMoney} className="money-tile-add">
            <Plus aria-hidden className="size-4" strokeWidth={3} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The top line's money (Owarine 90a91d71 `BalanceChip variant="bar"`; R4-8, D-227): ONE pill — the sum in the figures
 * face, the privacy eye inside it (from 768 px; on a phone the account menu hides balances), and the vermilion + that
 * adds money. No token mark: there is no pathUSD mark, and the USDC disc would misstate it; "$" already says dollars.
 */
export function MoneyPillView({ total, onAdd = openFunds, title }: { total: bigint | null; onAdd?: (() => void) | null; title?: string }) {
  const hidden = usePrivacy();
  return (
    <span className="money-chip" title={title}>
      {/* Masked, it is named "Hidden" as the kit's `Masked` is (an aria-label on a bare span is not announced). */}
      <span className={`money-chip-sum numbers${total === null && !hidden ? " is-dim" : ""}`} role={hidden ? "img" : undefined} aria-label={hidden ? SHELL.privacyHidden : undefined}>
        {hidden ? SHELL.masked : dollars(total)}
      </span>
      {/* Slush's balance eye (S22, RV-10): hides every balance and PnL on this device. */}
      <button type="button" className="money-chip-eye" aria-pressed={hidden} aria-label={hidden ? SHELL.privacyShow : SHELL.privacyHide} title={hidden ? SHELL.privacyShow : SHELL.privacyHide} onClick={() => setPrivacy(!hidden)}>
        {hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </button>
      {onAdd ? (
        <button type="button" className="money-chip-add" onClick={onAdd} aria-label={SHELL.addMoney} title={SHELL.addMoney}>
          <Plus aria-hidden strokeWidth={3} />
        </button>
      ) : null}
    </span>
  );
}

/** The top line's demo balance (Owarine `BalanceChip variant="bar"` in DEMO; P6, D-224): the paper dollars, no +. */
export function DemoMoneyPill() {
  const demo = useDemoState();
  return <MoneyPillView total={BigInt(demo.balanceBase)} onAdd={null} title={SHELL.demoLabel} />;
}

/** Signed out: DEMO's paper dollars (D-223; Owarine's "Demo credits 10,000.00"), with no + — paper is not topped up. */
export function DemoMoneyTile() {
  const demo = useDemoState();
  return <MoneyTile total={BigInt(demo.balanceBase)} label={SHELL.demoLabel} onAdd={null} />;
}
