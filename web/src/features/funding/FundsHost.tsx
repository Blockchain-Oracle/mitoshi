"use client";
/**
 * Answers `openFunds()` from anywhere, the first-credit welcome (Masayume's `yosuku:open-funds` / `yosuku:credited`
 * listeners), and the funding of a brand-new account (`cwf:account-created`, D-224). The dialogs are lazy islands:
 * nothing loads until an event fires. The welcome is suppressed while Add money shows its own funded receipt, and when
 * the account was created to place an order (R4-4, D-227: a toast names what landed instead of a modal over the order).
 * R6 money (S25, D-230): signed out, Add money is one step — the sign-in sheet opens titled for the money ("to get
 * $1,000,000 test dollars"), and Add money reopens by itself once an account is there (`resume.ts`); a new passkey
 * account opens it on its first fund's wait. A sheet closed without an account forgets the promise.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { webEnv } from "@/lib/env";
import { OPEN_FUNDS_EVENT } from "@/lib/funds-event";
import { useWalletSession } from "@/lib/wallet-session";
import { useDataReady } from "@/providers/data/context";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { CREDITED_EVENT, FUNDING } from "./copy";
import { ACCOUNT_CREATED_EVENT, isWelcomeSuppressed, type CreditedDetail } from "./credited";
import { FirstFund } from "./FirstFund";
import { clearFundsResume, faucetDollars, markFundsResume, takeFundsResume } from "./resume";

const AddFunds = dynamic(() => import("./AddFunds"), { ssr: false });
const CreditWelcome = dynamic(() => import("./CreditWelcome"), { ssr: false });

export function FundsHost() {
  // Add money reads balances through the query client: an early "+" waits (≤ a moment) for the late data layer.
  const dataReady = useDataReady();
  const session = useWalletSession();
  const { pickerOpen } = useWalletShell();
  const [fundsOpen, setFundsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeMounted, setWelcomeMounted] = useState(false);
  const [fundsMounted, setFundsMounted] = useState(false);
  // A brand-new account's funding; `forOrder` when it signed in to place an order (no welcome wall over it, R4-4).
  const [firstFund, setFirstFund] = useState<{ forOrder: boolean } | null>(null);
  const firstFundDone = useCallback(() => setFirstFund(null), []);
  const address = session.address;
  const connectFor = session.connectFor;
  // The listener below is bound once; it reads the latest account and sign-in through these.
  const addressRef = useRef(address);
  const connectRef = useRef(connectFor);
  useEffect(() => {
    addressRef.current = address;
    connectRef.current = connectFor;
  });

  useEffect(() => {
    const onOpen = () => {
      if (!addressRef.current) {
        // Signed out: the sign-in sheet, titled for the money; Add money follows the account.
        markFundsResume(Date.now());
        connectRef.current(webEnv.markets.network === "testnet" ? FUNDING.modal.signInIntent(faucetDollars()) : FUNDING.modal.signInIntentMainnet);
        return;
      }
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

  // The account arrived with a promise pending: Add money opens on its own.
  useEffect(() => {
    if (!address || !takeFundsResume(Date.now())) return;
    setFundsMounted(true);
    setFundsOpen(true);
  }, [address]);

  // The sheet closed with no account: nothing reopens later.
  const wasOpen = useRef(pickerOpen);
  useEffect(() => {
    if (wasOpen.current && !pickerOpen && !addressRef.current) clearFundsResume();
    wasOpen.current = pickerOpen;
  }, [pickerOpen]);

  return (
    <>
      {firstFund && dataReady ? <FirstFund onDone={firstFundDone} forOrder={firstFund.forOrder} /> : null}
      {fundsMounted && dataReady ? <AddFunds open={fundsOpen} onOpenChange={setFundsOpen} funding={firstFund !== null} /> : null}
      {welcomeMounted && !fundsOpen ? <CreditWelcome open={welcomeOpen} onOpenChange={setWelcomeOpen} /> : null}
    </>
  );
}
