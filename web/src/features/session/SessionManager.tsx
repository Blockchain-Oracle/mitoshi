"use client";
// Ported from Masayume 68f7a09:web/src/features/session/SessionManager.tsx (`SessionManagerBody`) — the limits, usage
// and key details, the needs-a-key and expired faces, revoke / re-key / forget; the gas line and the STT top-up are
// gone (the relay pays every tap), and the usage is two meters from the adopted 21st 19006 (`UsageMeter`) instead of a
// definition list. Adds the E.5 S7 actions: one-tap renew, "Add to budget", "Extend".
import { capResetsAtSec } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import { TxFailureCard } from "@/components/tx";
import { UsageMeter } from "@/components/ui/usage-meter";
import { useNowMs } from "@/lib/clock";
import { ArmTradingBalance } from "./ArmTradingBalance";
import { leftNowBase, spentTodayBase, topUpBase, usd } from "./caps";
import { SESSION } from "./copy";
import { useSessionActions, useSessionView } from "./context";
import { useSessionWrites } from "./useSessionWrites";
import { SheetFooter } from "@/components/ui/overlay-footer";

const M = SESSION.manager;
const at = (sec: number) => new Date(sec * 1000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
const btn = "inline-flex min-h-touch w-full items-center justify-center rounded-md px-4 type-body-strong disabled:opacity-60";
const primary = `${btn} bg-accent-fill text-on-accent`;
const secondary = `${btn} border border-border-strong text-ink`;

export function SessionManagerBody() {
  const view = useSessionView();
  const actions = useSessionActions();
  const nowMs = useNowMs();
  const nowSec = Math.floor((nowMs || Date.now()) / 1000);
  const w = useSessionWrites();
  const grant = view.grant;
  const busy = w.busy !== null;
  const failure = w.tx.state.kind === "failed" ? <TxFailureCard state={w.tx.state} onRetry={() => w.tx.dispatch({ type: "reset" })} /> : null;

  if (!grant || view.status === "disarmed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-body text-ink-secondary">{M.offBody}</p>
        <ArmTradingBalance />
      </div>
    );
  }
  const spent = spentTodayBase(grant, nowSec);
  const left = leftNowBase(grant, nowSec);
  const expired = view.status === "expired" || grant.expiresAtSec < nowSec;
  const needsKey = view.status === "grant-without-key";
  const add = topUpBase(grant);

  return (
    <div className="flex flex-col gap-5">
      {needsKey ? (
        <div className="flex flex-col gap-1 rounded-md border border-hairline bg-surface-2 p-3" role="status">
          <p className="type-body-strong text-ink">{M.needsKeyTitle}</p>
          <p className="type-caption text-ink-secondary">{M.needsKeyBody}</p>
        </div>
      ) : null}
      {expired && !needsKey ? (
        <div className="flex flex-col gap-1 rounded-md border border-hairline bg-surface-2 p-3" role="status">
          <p className="type-body-strong text-ink">{M.expiredTitle}</p>
          <p className="type-caption text-ink-secondary">{M.expiredBody}</p>
        </div>
      ) : null}
      <UsageMeter
        title={M.usage}
        rows={[
          { id: "today", label: M.spentToday, used: Number(spent), max: Number(grant.caps.maxDailySpendBase), valueText: `${usd(spent)} of ${usd(grant.caps.maxDailySpendBase)}`, note: M.resets(at(capResetsAtSec(nowSec))), warn: left < grant.caps.maxStakePerTradeBase },
          { id: "budget", label: M.budget, used: Number(grant.budgetBase), max: Number(grant.budgetBase + spent > 0n ? grant.budgetBase + spent : 1n), valueText: usd(grant.budgetBase), warn: grant.budgetBase < grant.caps.maxStakePerTradeBase },
        ]}
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 type-caption">
        <div><dt className="text-ink-secondary">{M.perTap}</dt><dd className="numbers text-ink">{usd(grant.caps.maxStakePerTradeBase)}</dd></div>
        <div><dt className="text-ink-secondary">{M.perDay}</dt><dd className="numbers text-ink">{usd(grant.caps.maxDailySpendBase)}</dd></div>
        <div><dt className="text-ink-secondary">{M.positions}</dt><dd className="numbers text-ink">{grant.openPositions} / {grant.caps.maxOpenPositions}</dd></div>
        <div><dt className="text-ink-secondary">{M.price}</dt><dd className="numbers text-ink">{grant.caps.maxPriceRaw === 0n ? M.noPriceCap : `${Number(grant.caps.maxPriceRaw / 10_000n)}¢`}</dd></div>
        <div><dt className="text-ink-secondary">{M.scope}</dt><dd className="text-ink">{grant.caps.market ? M.oneWindow : M.anyWindow}</dd></div>
        <div><dt className="text-ink-secondary">{M.expires}</dt><dd className="numbers text-ink">{at(grant.expiresAtSec)}</dd></div>
        <div className="col-span-2"><dt className="text-ink-secondary">{M.key}</dt><dd className="numbers text-ink">{shortHex(grant.actor, 8, 6)}</dd></div>
      </dl>
      {failure}
      <div className="flex flex-col gap-2">
        <SheetFooter>
        {needsKey ? (
          <button type="button" className={primary} disabled={busy} onClick={() => void w.rekey()}>{w.busy === "rekey" ? SESSION.busy : M.rekey}</button>
        ) : expired ? (
          <button type="button" className={primary} disabled={busy} onClick={() => void w.extend()}>{w.busy === "extend" ? SESSION.busy : M.renew(SESSION.expiries.h24)}</button>
        ) : (
          <>
            <button type="button" className={primary} disabled={busy} onClick={() => void w.addBudget()}>{w.busy === "add" ? SESSION.busy : M.addBudget(usd(add))}</button>
            <button type="button" className={secondary} disabled={busy} onClick={() => void w.extend()}>{w.busy === "extend" ? SESSION.busy : M.extend(SESSION.expiries.h24)}</button>
          </>
        )}
        </SheetFooter>
        <p className="type-caption text-ink-secondary">{M.rootNote}</p>
        <button type="button" className={secondary} disabled={busy} onClick={() => void w.revoke()}>{w.busy === "revoke" ? M.revoking : M.revoke}</button>
        <p className="type-caption text-ink-secondary">{M.revokeNote}</p>
        {view.keyAddress && (needsKey || expired) ? (
          <button type="button" className="min-h-touch self-start py-2 type-caption text-ink underline" onClick={() => void actions.forgetKey()}>{M.forget}</button>
        ) : null}
      </div>
    </div>
  );
}
