"use client";
/**
 * Answers `openFunds()` from anywhere, the first-credit welcome (Masayume's `yosuku:open-funds` / `yosuku:credited`
 * listeners), and the funding of a brand-new account (`cwf:account-created`, D-224). The dialogs are lazy islands:
 * nothing loads until an event fires. The welcome is suppressed while Add money shows its own funded receipt, and when
 * the account was created to place an order (R4-4, D-227: a toast names what landed instead of a modal over the order).
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { OPEN_FUNDS_EVENT } from "@/lib/funds-event";
import { useDataReady } from "@/providers/data/context";
import { CREDITED_EVENT } from "./copy";
import { ACCOUNT_CREATED_EVENT, isWelcomeSuppressed, type CreditedDetail } from "./credited";
import { FirstFund } from "./FirstFund";

const AddFunds = dynamic(() => import("./AddFunds"), { ssr: false });
const CreditWelcome = dynamic(() => import("./CreditWelcome"), { ssr: false });

export function FundsHost() {
  // Add money reads balances through the query client: an early "+" waits (≤ a moment) for the late data layer.
  const dataReady = useDataReady();
  const [fundsOpen, setFundsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeMounted, setWelcomeMounted] = useState(false);
  const [fundsMounted, setFundsMounted] = useState(false);
  // A brand-new account's funding; `forOrder` when it signed in to place an order (no welcome wall over it, R4-4).
  const [firstFund, setFirstFund] = useState<{ forOrder: boolean } | null>(null);
  const firstFundDone = useCallback(() => setFirstFund(null), []);

  useEffect(() => {
    const onOpen = () => {
      setFundsMounted(true);
      setFundsOpen(true);
    };
    const onCredited = (event: Event) => {
      if (!(event as CustomEvent<CreditedDetail>).detail?.firstTime || isWelcomeSuppressed()) return;
      setWelcomeMounted(true);
      setWelcomeOpen(true);
    };
    const onCreated = (event: Event) => setFirstFund({ forOrder: Boolean((event as CustomEvent<{ forOrder?: boolean }>).detail?.forOrder) });
    window.addEventListener(OPEN_FUNDS_EVENT, onOpen);
    window.addEventListener(CREDITED_EVENT, onCredited);
    window.addEventListener(ACCOUNT_CREATED_EVENT, onCreated);
    return () => {
      window.removeEventListener(OPEN_FUNDS_EVENT, onOpen);
      window.removeEventListener(CREDITED_EVENT, onCredited);
      window.removeEventListener(ACCOUNT_CREATED_EVENT, onCreated);
    };
  }, []);

  return (
    <>
      {firstFund && dataReady ? <FirstFund onDone={firstFundDone} forOrder={firstFund.forOrder} /> : null}
      {fundsMounted && dataReady ? <AddFunds open={fundsOpen} onOpenChange={setFundsOpen} /> : null}
      {welcomeMounted && !fundsOpen ? <CreditWelcome open={welcomeOpen} onOpenChange={setWelcomeOpen} /> : null}
    </>
  );
}
