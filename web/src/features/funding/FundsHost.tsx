"use client";
/**
 * Answers `openFunds()` from anywhere, the first-credit welcome (Masayume's `yosuku:open-funds` / `yosuku:credited`
 * listeners), and the funding of a brand-new account (`cwf:account-created`, D-224). The dialogs are lazy islands:
 * nothing loads until an event fires. The welcome is suppressed while Add money shows its own funded receipt.
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
  const [firstFund, setFirstFund] = useState(false);
  const firstFundDone = useCallback(() => setFirstFund(false), []);

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
    const onCreated = () => setFirstFund(true);
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
      {firstFund && dataReady ? <FirstFund onDone={firstFundDone} /> : null}
      {fundsMounted && dataReady ? <AddFunds open={fundsOpen} onOpenChange={setFundsOpen} /> : null}
      {welcomeMounted && !fundsOpen ? <CreditWelcome open={welcomeOpen} onOpenChange={setWelcomeOpen} /> : null}
    </>
  );
}
