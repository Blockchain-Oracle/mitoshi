"use client";
// The header money pill (Masayume 68f7a09 HeaderMoneyPill): pathUSD (+ the Trading Balance once it exists), a `+` that
// opens Add money, and "never show a half-loaded sum". Split out of HeaderAccount so its balance read (TanStack Query)
// loads with the signed-in session, not in every page's first load (§3.1).
import type { Address } from "@cwf/core";
import { useBalanceSheet } from "@cwf/markets/react";
import { openFunds } from "@/lib/funds-event";
import { dollars } from "@/providers/wallet/format";

export function MoneyPill({ address }: { address: Address }) {
  const sheet = useBalanceSheet(address);
  const value = sheet?.ok ? sheet.value : null;
  const total = value ? value.spendableBase + (value.vaultBase ?? 0n) : null;
  return <MoneyPillView total={total} />;
}

export function MoneyPillView({ total }: { total: bigint | null }) {
  return (
    <button type="button" onClick={openFunds} aria-label={`Balance ${dollars(total)}. Add money`} className="dusdc-pill min-h-touch">
      <span className={`dusdc-total numbers${total === null ? " dusdc-total--dim" : ""}`}>{dollars(total)}</span>
      <span className="dusdc-plus" aria-hidden>+</span>
    </button>
  );
}
