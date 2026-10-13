"use client";
// The "You" tab of `/launch/[token]` (S17; R4-11, D-227): what the signed-in account holds of the coin, its value at the
// curve price and what selling it all pays now; then the claims rows — launchpad fees, the leftover after graduation,
// the locker's pool fees — each shown only when the chain says something is owed, each one sponsored transaction.
import type { Address, TxIntent } from "@cwf/core";
import type { MemeLaunch } from "@cwf/markets/launch";
import { invalidateLaunch, useMemeClaims, useMemePosition } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { GroupedList, PillButton } from "@/components/kit";
import { TxFailureCard, useTxLifecycle } from "@/components/tx";
import { useWalletSession } from "@/lib/wallet-session";
import { LAUNCH } from "./copy";
import { coinText, usdText } from "./format";

const K = LAUNCH.token;

export function TokenYou({ m }: { m: MemeLaunch }) {
  const session = useWalletSession();
  const address = session.address as Address | null;
  const position = useMemePosition(m.token, address);
  const claims = useMemeClaims(address, m.token);
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  if (!address) return <PillButton tone="ink" onClick={() => session.connectFor(K.tabs.you)}>{LAUNCH.trade.signIn}</PillButton>;
  const p = position?.ok ? position.value : null;
  const c = claims?.ok ? claims.value : null;
  const run = async (intent: TxIntent) => {
    const outcome = await tx.run(intent);
    if (outcome?.status === "confirmed") await invalidateLaunch(queryClient);
  };
  const isCreator = m.creator.toLowerCase() === address.toLowerCase();
  const rows: { label: string; detail: string; intent: TxIntent }[] = [];
  if (c && c.launchpadFees > 0n) rows.push({ label: K.claimFees, detail: usdText(c.launchpadFees), intent: { kind: "launch-claim-fees" } });
  if (c?.lockerFees && (c.lockerFees.quote > 0n || c.lockerFees.coin > 0n)) rows.push({ label: K.lockerFees, detail: `${usdText(c.lockerFees.quote)} + ${coinText(c.lockerFees.coin)}`, intent: { kind: "launch-locker-claim-fees", coin: m.token } });
  if (isCreator && m.graduation && m.graduation.leftover > 0n) rows.push({ label: K.claimLeftover, detail: coinText(m.graduation.leftover), intent: { kind: "launch-claim-leftover", token: m.token } });
  return (
    <div className="lp-you">
      {position === null ? <p className="lp-note">{K.reading}</p> : !p || p.coin === 0n ? <p className="lp-note">{K.youNone}</p> : (
        <div className="lp-you-hold">
          <span className="numbers type-body-strong text-ink">{K.youHold(`${coinText(p.coin)} $${m.meta.symbol}`, usdText(p.valueAtCurve))}</span>
          {p.exitQuote !== null ? <span className="numbers type-caption text-ink-secondary">{K.exit(usdText(p.exitQuote))}</span> : null}
        </div>
      )}
      {rows.length > 0 ? (
        <GroupedList title={K.claims}>
          {rows.map((r) => (
            <div key={r.label} className="kit-item">
              <span className="kit-item-label">{r.label}</span>
              <span className="kit-item-detail numbers">{r.detail}</span>
              <PillButton tone="accent" size="sm" disabled={tx.state.kind === "signing" || tx.state.kind === "submitted"} onClick={() => void run(r.intent)}>{r.label.split(" ")[0]}</PillButton>
            </div>
          ))}
        </GroupedList>
      ) : null}
      {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
    </div>
  );
}
