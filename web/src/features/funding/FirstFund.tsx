"use client";
/**
 * A brand-new passkey account is funded by the server with no second prompt, as Owarine's seat is (D-224): the sign-in
 * modal closes on the passkey, this runs the faucet claim from the shell, and `CreditWelcome` says it landed. When it
 * didn't, one toast says so and offers Add money. Mainnet has no faucet: nothing to do. R4-4 (D-227; critic gap 10,
 * bug 6): signed in to place an order, the welcome modal would be a wall between the user and that order — so the
 * welcome is suppressed and a toast names what landed ("+$X test dollars", the new account's balance as the chain reads
 * it once funded; the dots in privacy mode), while the order CTAs say "Funding your account…" (`first-fund-state`)
 * until it has.
 */
import { keys, useMarketsPort } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { money } from "@/features/terminal/format";
import { SHELL } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { openFunds } from "@/lib/funds-event";
import { isPrivacyOn } from "@/lib/privacy";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { FUNDING } from "./copy";
import { suppressWelcome } from "./credited";
import { setFirstFunding } from "./first-fund-state";
import { useFaucetClaim } from "./useFaucetClaim";

export function FirstFund({ onDone, forOrder = false }: { onDone: () => void; forOrder?: boolean }) {
  const session = useWalletSession();
  const faucet = useFaucetClaim({ address: session.address, viaSession: true });
  const queryClient = useQueryClient();
  const port = useMarketsPort();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (webEnv.markets.network !== "testnet") {
      started.current = true;
      onDone();
      return;
    }
    if (!session.address) return;
    const address = session.address;
    started.current = true;
    setFirstFunding(true);
    const release = forOrder ? suppressWelcome() : null;
    void faucet.claim().then(async (state) => {
      if (state.phase === "failed") {
        notify.item({ id: "first-fund", title: FUNDING.firstFund.failed, description: FUNDING.errors[state.code], type: "warning", action: { label: FUNDING.firstFund.addMoney, onClick: openFunds } });
      } else if (state.phase === "funded" && forOrder) {
        // A brand-new account held nothing before: what it holds now is what landed.
        const sheet = port ? await port.getBalanceSheet(address) : null;
        notify.item({ id: "first-fund", title: sheet?.ok && sheet.value.spendableBase > 0n ? FUNDING.firstFund.landed(isPrivacyOn() ? SHELL.masked : money(sheet.value.spendableBase)) : FUNDING.welcome.title });
      }
      await queryClient.invalidateQueries({ queryKey: keys.balanceSheet(address) });
      setFirstFunding(false);
      release?.();
      onDone();
    });
  }, [session.address, faucet, onDone, forOrder, queryClient, port]);
  return null;
}
