"use client";
// The earn CTA while it waits (R6 money, T07; D-230): the account's balance is a pill-shaped skeleton for its first
// three seconds (most reads land in one), then a named wait with its seconds and, at ~15 s, an honest error with Retry
// that re-reads the balance (states-kit `WaitingText`, From 21st.dev 12338 serafimcloud/text-shimmer). A wait the page
// names itself (a closed Window settling) is the same pill with its words. Never a sentence in an empty box.
import { keys } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useWaitClock, WaitingText } from "@/components/states/WaitingText";
import { useWalletSession } from "@/lib/wallet-session";
import { EARN } from "./copy";

export function AccountWait() {
  const clock = useWaitClock(undefined, null);
  const queryClient = useQueryClient();
  const { address } = useWalletSession();
  if (!clock.late) return <div className="ea-cta-skel skel" role="status" aria-busy="true" aria-label={EARN.supply.reading} />;
  return (
    <div className="ea-cta-wait">
      <WaitingText onRetry={() => void queryClient.invalidateQueries({ queryKey: keys.balanceSheet(address) })}>{EARN.supply.reading}</WaitingText>
    </div>
  );
}

export function NamedWait({ children }: { children: string }) {
  return (
    <div className="ea-cta-wait">
      <WaitingText timeoutMs={null}>{children}</WaitingText>
    </div>
  );
}
