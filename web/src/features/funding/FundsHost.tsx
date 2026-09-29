"use client";
/**
 * Answers `openFunds()` from anywhere and the first-credit welcome (Masayume's `yosuku:open-funds` / `yosuku:credited`
 * listeners). Both dialogs are lazy islands: nothing loads until the event fires. The welcome is suppressed while the
 * sign-in ceremony shows its own funded step (`suppressWelcome`).
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { OPEN_FUNDS_EVENT } from "@/lib/funds-event";
import { CREDITED_EVENT } from "./copy";
import { isWelcomeSuppressed, type CreditedDetail } from "./credited";

const AddFunds = dynamic(() => import("./AddFunds"), { ssr: false });
const CreditWelcome = dynamic(() => import("./CreditWelcome"), { ssr: false });

export function FundsHost() {
  const [fundsOpen, setFundsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeMounted, setWelcomeMounted] = useState(false);
  const [fundsMounted, setFundsMounted] = useState(false);

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
    window.addEventListener(OPEN_FUNDS_EVENT, onOpen);
    window.addEventListener(CREDITED_EVENT, onCredited);
    return () => {
      window.removeEventListener(OPEN_FUNDS_EVENT, onOpen);
      window.removeEventListener(CREDITED_EVENT, onCredited);
    };
  }, []);

  return (
    <>
      {fundsMounted ? <AddFunds open={fundsOpen} onOpenChange={setFundsOpen} /> : null}
      {welcomeMounted && !fundsOpen ? <CreditWelcome open={welcomeOpen} onOpenChange={setWelcomeOpen} /> : null}
    </>
  );
}
