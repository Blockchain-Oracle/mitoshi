"use client";
/**
 * "Your calls" — the user's own positions pinned at the top of /markets (D-048): each call walks to its own verdict and
 * payout here while the hero moves on to the next Window. Renders nothing for a signed-out visitor or an account with
 * no calls from this device.
 */
import { useWalletSession } from "@/lib/wallet-session";
import SectionHead from "@/components/shell/SectionHead";
import { CALLS_SECTION } from "../copy";
import { dismissCall } from "../data/calls-store";
import { useCalls } from "../data/useCalls";
import { PinnedCall } from "./PinnedCall";

export function YourCalls() {
  const { address } = useWalletSession();
  const calls = useCalls(address);
  if (!address || calls.length === 0) return null;
  return (
    <section className="markets-section flex flex-col gap-4" aria-label={CALLS_SECTION.title}>
      <SectionHead number={CALLS_SECTION.index} title={CALLS_SECTION.title} desc={CALLS_SECTION.desc} />
      <div className="grid gap-4 md:grid-cols-2">
        {calls.map((call) => (
          <PinnedCall key={`${call.marketId}:${call.side}`} wallet={address} call={call} onDismiss={() => dismissCall(address, call.marketId)} />
        ))}
      </div>
    </section>
  );
}
