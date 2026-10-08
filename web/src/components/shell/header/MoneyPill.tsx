"use client";
// The header money pill (Masayume 68f7a09 HeaderMoneyPill): pathUSD (+ the Trading Balance once it exists), a `+` that
// opens Add money, and "never show a half-loaded sum". Split out of HeaderAccount so its balance read (TanStack Query)
// loads with the signed-in session, not in every page's first load (§3.1).
import type { Address } from "@cwf/core";
import { useBalanceSheet } from "@cwf/markets/react";
import { Eye, EyeOff } from "lucide-react";
import { SHELL } from "@/lib/copy";
import { openFunds } from "@/lib/funds-event";
import { setPrivacy, usePrivacy } from "@/lib/privacy";
import { dollars } from "@/providers/wallet/format";

export function MoneyPill({ address }: { address: Address }) {
  const sheet = useBalanceSheet(address);
  const value = sheet?.ok ? sheet.value : null;
  const total = value ? value.spendableBase + (value.vaultBase ?? 0n) : null;
  return <MoneyPillView total={total} />;
}

export function MoneyPillView({ total }: { total: bigint | null }) {
  const hidden = usePrivacy();
  const shown = hidden ? SHELL.masked : dollars(total);
  return (
    <span className="money-pill">
      <button type="button" onClick={openFunds} aria-label={hidden ? `Balance hidden. Add money` : `Balance ${dollars(total)}. Add money`} className="dusdc-pill min-h-touch">
        <span className={`dusdc-total numbers${total === null && !hidden ? " dusdc-total--dim" : ""}`}>{shown}</span>
        <span className="dusdc-plus" aria-hidden>+</span>
      </button>
      {/* Slush's balance eye (S22, RV-10): hides every balance and PnL on this device. */}
      <button type="button" className="money-eye size-touch" aria-pressed={hidden} aria-label={hidden ? SHELL.privacyShow : SHELL.privacyHide} onClick={() => setPrivacy(!hidden)}>
        {hidden ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </span>
  );
}
