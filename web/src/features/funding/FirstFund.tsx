"use client";
/**
 * A brand-new passkey account is funded by the server with no second prompt, as Owarine's seat is (D-224): the sign-in
 * modal closes on the passkey, this runs the faucet claim from the shell, and `CreditWelcome` says it landed. When it
 * didn't, one toast says so and offers Add money. Mainnet has no faucet: nothing to do.
 */
import { useEffect, useRef } from "react";
import { webEnv } from "@/lib/env";
import { openFunds } from "@/lib/funds-event";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { FUNDING } from "./copy";
import { useFaucetClaim } from "./useFaucetClaim";

export function FirstFund({ onDone }: { onDone: () => void }) {
  const session = useWalletSession();
  const faucet = useFaucetClaim({ address: session.address, viaSession: true });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (webEnv.markets.network !== "testnet") {
      started.current = true;
      onDone();
      return;
    }
    if (!session.address) return;
    started.current = true;
    void faucet.claim().then((state) => {
      if (state.phase === "failed") {
        notify.item({ id: "first-fund", title: FUNDING.firstFund.failed, description: FUNDING.errors[state.code], type: "warning", action: { label: FUNDING.firstFund.addMoney, onClick: openFunds } });
      }
      onDone();
    });
  }, [session.address, faucet, onDone]);
  return null;
}
