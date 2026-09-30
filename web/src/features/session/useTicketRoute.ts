"use client";
// Ported from Masayume 68f7a09:web/src/features/session/useTicketRoute.ts — AD-3's third dimension decided per call.
// Kept: an armed tap the caps refuse does not fail and is not sent — it says why. Changed (E.5 S7): the reason is on
// the CTA itself with its one-step fix ("Budget used — add $25"), and paying from the wallet instead is an explicit
// choice that says whether it prompts — never a silent fallback to a surprise passkey prompt.
/**
 * Which route the ticket's call takes: the Trading Balance's session key (`vault-grant`, no prompt, sponsored) while it
 * is armed and the grant covers this call exactly as the vault will check it (`simulateCaps` at the worst the fill can
 * charge, D-091 scope included); otherwise the wallet. A refusal comes back as the CTA's words and its fix.
 */
import { oneUnit, ownTermsPriceRaw, simulateCaps, type EventMarket, type OrderRoute, type Quote, type Side } from "@cwf/core";
import { useVaultHoldings } from "@cwf/markets/react";
import { useEffect, useState } from "react";
import { nowMs as clockNow } from "@/lib/clock";
import { fallbackOf, leftNowBase, type FallbackFix } from "./caps";
import { SESSION } from "./copy";
import { useSessionView } from "./context";

export interface TicketRoute {
  route: OrderRoute;
  /** The Trading Balance signs this call (no prompt). */
  viaBalance: boolean;
  /** What the session key may spend on this call right now (today's headroom within the budget); null off the balance. */
  availableBase: bigint | null;
  /** Tap-trading is armed but cannot take this call: the CTA's words and its fix. Null otherwise. */
  fallback: { reason: string; fix: FallbackFix } | null;
  /** The user chose to pay this call from the wallet after a refusal. */
  payingFromWallet: boolean;
  payFromWallet(): void;
  backToBalance(): void;
}

export function useTicketRoute({ market, side, stakeBase, quote, listed }: { market: EventMarket; side: Side | null; stakeBase: bigint; quote: Quote | null; listed: boolean }): TicketRoute {
  const view = useSessionView();
  const armed = view.status === "armed" && view.grant !== null;
  const holdings = useVaultHoldings(armed ? view.owner : null, armed ? market.marketId : null);
  const [fromWallet, setFromWallet] = useState(false);
  // A new composition starts on the Trading Balance again.
  useEffect(() => setFromWallet(false), [market.marketId, side, stakeBase]);
  const wallet: OrderRoute = { kind: "wallet" };
  const base = { payingFromWallet: fromWallet, payFromWallet: () => setFromWallet(true), backToBalance: () => setFromWallet(false), availableBase: null };
  if (!armed || !view.grant) return { route: wallet, viaBalance: false, fallback: null, ...base };
  if (listed) return { route: wallet, viaBalance: false, fallback: fromWallet ? null : { reason: SESSION.fallback.scheduled, fix: null }, ...base };
  const grant = view.grant;
  let fallback: TicketRoute["fallback"] = null;
  if (quote && side) {
    const held = holdings?.ok ? (side === "up" ? holdings.value.upRaw : holdings.value.downRaw) : 0n;
    const verdict = simulateCaps({
      grant, nowSec: Math.floor(clockNow() / 1000), marketId: market.marketId, sidePriceRaw: ownTermsPriceRaw(quote.limitPriceRaw, side, market.decimals),
      quantityRaw: quote.contractsRaw, spendBase: quote.maxCostBase, one: oneUnit(market.decimals), opensNewPosition: held === 0n,
    });
    if (!verdict.ok) fallback = fallbackOf(verdict.refusal, grant);
  }
  if (fallback && fromWallet) return { route: wallet, viaBalance: false, fallback: null, ...base };
  if (fallback) return { route: wallet, viaBalance: false, fallback, ...base };
  return { route: { kind: "vault-grant", grantId: grant.grantId }, viaBalance: true, fallback: null, ...base, availableBase: leftNowBase(grant, Math.floor(clockNow() / 1000)) };
}
