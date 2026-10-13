"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/CopyFormFields.tsx (`checkCopyForm`'s fields and their red
// lines) — on one transaction: the plan says, line by line, what the one signature does before it is asked for.
// R4-2 (D-227): the one action sits in the copy sheet's pinned footer (`SheetFooter`), not a sticky strip in the body.
import { formatBaseUnits, USD_DECIMALS, type SubscriptionMode } from "@cwf/core";
import { useState } from "react";
import { TxCta, TxFailureCard } from "@/components/tx";
import { SheetFooter } from "@/components/ui/overlay-footer";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { usePrivacy } from "@/lib/privacy";
import { COPY } from "./copy";
import { COPY_TERM_SEC, planCopy } from "./copy-plan";
import type { StrategyWire } from "./protocol";
import type { CopyWrites } from "./useCopyWrites";

const usd = (base: bigint) => formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 });

function Field({ id, label, help, error, value, onChange }: { id: string; label: string; help: string; error: string | null; value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="type-body-strong text-ink">{label}</span>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 type-body text-ink-secondary">$</span>
        <Input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={`${id}-help`} className="min-h-touch pl-7 tabular-nums" />
      </div>
      <span id={`${id}-help`} className={error ? "type-caption text-loss" : "type-caption text-ink-secondary"}>{error ?? help}</span>
    </label>
  );
}

export function CopyForm({ card, strategies, writes }: { card: StrategyWire; strategies: readonly StrategyWire[]; writes: CopyWrites }) {
  const [mode, setMode] = useState<SubscriptionMode>("follow");
  const [choice, setChoice] = useState<"share" | "new">("share");
  const maxPerTrade = BigInt(card.envelope.maxStakePerTradeBase);
  const [budgetText, setBudget] = useState("10");
  const [perTradeText, setPerTrade] = useState(usd(maxPerTrade < 2_000_000n ? maxPerTrade : 2_000_000n));
  const [done, setDone] = useState(false);
  const busy = writes.tx.state.kind !== "idle" && writes.tx.state.kind !== "failed" && writes.tx.state.kind !== "confirmed";
  const hidden = usePrivacy();
  const plan = planCopy({
    strategy: card, strategies, mine: writes.mine, grant: writes.grant, availableBase: writes.availableBase, walletBase: writes.walletBase, hideWallet: hidden,
    mode, choice, budgetText, perTradeText, nowSec: Math.floor(Date.now() / 1000), busy, signedIn: writes.signedIn,
  });
  const canShare = writes.grant !== null && plan.shareBlocked === null && writes.grant.actor.toLowerCase() === card.runner.toLowerCase();

  if (done && writes.tx.state.kind === "confirmed") return <p role="status" className="type-body-strong text-profit">{COPY.done.copied}</p>;

  const send = async () => {
    if (!plan.intent) return;
    const outcome = await writes.run(plan.intent);
    if (outcome?.status === "confirmed") setDone(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <SegmentedControl label={COPY.mode.label} options={COPY.mode.options} value={mode} onValueChange={setMode} />
        <span className="type-caption text-ink-secondary">{mode === "fade" ? COPY.mode.fadeHelp : COPY.mode.followHelp}</span>
      </div>
      {canShare && <SegmentedControl label={COPY.route.label} options={COPY.route.options} value={choice} onValueChange={setChoice} />}
      {plan.route === "share" && writes.grant ? (
        <p className="type-body text-ink-secondary">{COPY.route.share(hidden ? null : writes.grant.budgetBase, writes.grant.caps.maxStakePerTradeBase)}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field id={`budget-${card.strategyId}`} label={COPY.form.budget} help={COPY.form.budgetHelp} error={plan.budgetError} value={budgetText} onChange={setBudget} />
          <Field id={`per-trade-${card.strategyId}`} label={COPY.form.perTrade} help={COPY.form.perTradeHelp(maxPerTrade)} error={plan.perTradeError} value={perTradeText} onChange={setPerTrade} />
        </div>
      )}
      {plan.intent && (
        <ul className="flex flex-col gap-1 type-caption text-ink-secondary" aria-label={COPY.plan.oneSignature}>
          {plan.depositBase > 0n && <li>{COPY.plan.deposit(plan.depositBase)}</li>}
          {plan.route === "new" && <li>{COPY.plan.grant(plan.budgetBase, plan.perTradeBase, COPY_TERM_SEC / 86_400)}</li>}
          {plan.carried.length > 0 && <li>{COPY.plan.carried(plan.carried.map((c) => c.name))}</li>}
          {plan.stops.length > 0 && <li className="text-warning">{COPY.plan.stops(plan.stops)}</li>}
          <li>{COPY.plan.fee(plan.feeBase)}</li>
          <li className="text-ink">{COPY.plan.oneSignature}</li>
        </ul>
      )}
      {writes.tx.state.kind === "failed" && <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} />}
      {/* The one action stays in reach while the details above it scroll (plan fix 7): the sheet's pinned footer. */}
      <SheetFooter>
        {!writes.signedIn ? (
          <button type="button" onClick={writes.connect} className="min-h-touch w-full rounded-full bg-accent-fill px-4 type-body-strong text-on-accent hover:bg-accent-fill-pressed">
            {COPY.blocked.signIn}
          </button>
        ) : plan.blockedBy ? (
          <p role="status" className="min-h-touch rounded-full border border-hairline px-4 py-3 text-center type-body-strong text-ink-secondary">{plan.blockedBy}</p>
        ) : (
          <TxCta state={writes.tx.state} action={COPY.cta(mode)} signer={writes.signer} sponsored={false} onConfirm={() => void send()} />
        )}
      </SheetFooter>
    </div>
  );
}
