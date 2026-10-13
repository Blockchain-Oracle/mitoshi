"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/CopyFormFields.tsx (R4-6, D-227) on Mitoshi's one-transaction
// copy (`planCopy`): the follow/fade pills, the money strip (Wallet · Trading Balance · This takes), Budget and Per trade
// with a Max chip and a red reason each, share/new only when the live budget can be shared, and the plan as Now → After
// rows. The action is `CopyCta`, pinned in the sheet's footer: it keeps its amount signed in or out, shakes and names
// the reason when blocked, and signed out opens sign-in for this very copy (sign-in at the end, D-224).
import type { SubscriptionMode } from "@cwf/core";
import { useState } from "react";
import { TxCta } from "@/components/tx";
import { cn } from "@/lib/utils";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { COPY } from "./copy";
import { COPY_TERM_SEC, planCopy } from "./copy-plan";
import { usd, usdInput } from "./format";
import { strategyIdentity } from "./identity";
import type { StrategyWire } from "./protocol";
import type { CopyWrites } from "./useCopyWrites";
import "./copy-form.css";
import "./desk.css";

const min = (a: bigint, b: bigint) => (a < b ? a : b);

export function useCopyForm(card: StrategyWire, strategies: readonly StrategyWire[], writes: CopyWrites) {
  const [mode, setMode] = useState<SubscriptionMode>("follow");
  const [choice, setChoice] = useState<"share" | "new">("share");
  const maxPerTrade = BigInt(card.envelope.maxStakePerTradeBase);
  const [budgetText, setBudget] = useState("10");
  const [perTradeText, setPerTrade] = useState(usdInput(min(maxPerTrade, 2_000_000n)));
  const busy = writes.tx.state.kind !== "idle" && writes.tx.state.kind !== "failed" && writes.tx.state.kind !== "confirmed";
  const plan = planCopy({
    strategy: card, strategies, mine: writes.mine, grant: writes.grant, availableBase: writes.availableBase, walletBase: writes.walletBase,
    mode, choice, budgetText, perTradeText, nowSec: Math.floor(Date.now() / 1000), busy, signedIn: writes.signedIn,
  });
  const canShare = writes.grant !== null && plan.shareBlocked === null && writes.grant.actor.toLowerCase() === card.runner.toLowerCase();
  /** Budget's Max: the wallet plus the Trading Balance (plus a live grant's unspent budget, which a new grant returns
   *  first — planCopy's `reusable`), less the fee. Per trade's Max: the tightest ceiling of this strategy and every copy
   *  the new budget carries (planCopy's own bound). */
  const nowSec = Math.floor(Date.now() / 1000);
  const liveGrantBase = writes.grant && !writes.grant.revoked && writes.grant.expiresAtSec > nowSec ? writes.grant.budgetBase : 0n;
  const maxBudget = writes.walletBase === null || writes.availableBase === null ? null : writes.walletBase + writes.availableBase + liveGrantBase - BigInt(card.feeBase);
  const ceiling = plan.carried.reduce((m, c) => {
    const e = strategies.find((s) => s.strategyId === c.strategyId)?.envelope;
    return e ? min(m, BigInt(e.maxStakePerTradeBase)) : m;
  }, maxPerTrade);
  const amount = plan.route === "new" ? plan.budgetBase : BigInt(card.feeBase) > 0n ? BigInt(card.feeBase) : null;
  return { mode, setMode, choice, setChoice, budgetText, setBudget, perTradeText, setPerTrade, plan, canShare, maxBudget, maxPerTrade: ceiling, amount, cta: COPY.cta(mode, amount) };
}
export type CopyFormModel = ReturnType<typeof useCopyForm>;

function Field({ id, label, value, onChange, error, onMax, maxOff }: { id: string; label: string; value: string; onChange: (v: string) => void; error: string | null; onMax: () => void; maxOff: boolean }) {
  return (
    <label htmlFor={id} className="desk-field-label block" data-invalid={error ? "" : undefined}>
      {label}
      <span className="copy-field-row mt-2">
        <input id={id} className={cn("strat-input text-ink", error && "copy-field-bad")} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" aria-invalid={error ? true : undefined} />
        <button type="button" className="copy-field-max" disabled={maxOff} onClick={onMax}>{COPY.form.max}</button>
      </span>
      {error && <span className="copy-field-error" role="alert">{error}</span>}
    </label>
  );
}

/** The two pills: Follow, and Fade in the down wash; locked once a copy is live. */
export function DirectionPills({ value, onChange, locked }: { value: SubscriptionMode; onChange: (m: SubscriptionMode) => void; locked?: boolean }) {
  return (
    <div className="strat-direction" role="radiogroup" aria-label={COPY.direction.label}>
      {(["follow", "fade"] as const).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} disabled={locked} className="strat-direction-pill" onClick={() => onChange(m)}>
          {m === "fade" ? COPY.direction.fade : COPY.direction.follow}
        </button>
      ))}
    </div>
  );
}

export function CopyForm({ card, form, writes }: { card: StrategyWire; form: CopyFormModel; writes: CopyWrites }) {
  const { plan } = form;
  const takes = plan.depositBase + plan.feeBase;
  return (
    <div className="flex flex-col gap-4">
      <DirectionPills value={form.mode} onChange={form.setMode} />
      {writes.signedIn && (
        <div className="copy-strip" aria-label={COPY.strip.label}>
          <div><span>{COPY.strip.wallet}</span><b>{writes.walletBase === null ? "—" : usd(writes.walletBase)}</b></div>
          <div><span>{COPY.strip.balance}</span><b>{writes.availableBase === null ? "—" : usd(writes.availableBase)}</b></div>
          <div data-tone={plan.budgetError && plan.budgetError !== COPY.form.notANumber ? "bad" : undefined}><span>{COPY.strip.takes}</span><b>{usd(takes)}</b></div>
        </div>
      )}
      {form.canShare && writes.grant && (
        <div className="copy-share" role="radiogroup" aria-label={COPY.form.budget}>
          <button type="button" role="radio" aria-checked={plan.route === "share"} className="strat-direction-pill" onClick={() => form.setChoice("share")}>{COPY.share.use(writes.grant.budgetBase)}</button>
          <button type="button" role="radio" aria-checked={plan.route === "new"} className="strat-direction-pill" onClick={() => form.setChoice("new")}>{COPY.share.fresh}</button>
        </div>
      )}
      {plan.route === "new" && (
        <div className="grid grid-cols-2 gap-3">
          <Field id={`budget-${card.strategyId}`} label={COPY.form.budget} value={form.budgetText} onChange={form.setBudget} error={plan.budgetError} maxOff={form.maxBudget === null || form.maxBudget <= 0n} onMax={() => form.maxBudget !== null && form.setBudget(usdInput(form.maxBudget))} />
          <Field id={`per-trade-${card.strategyId}`} label={COPY.form.perTrade} value={form.perTradeText} onChange={form.setPerTrade} error={plan.perTradeError} maxOff={false} onMax={() => form.setPerTrade(usdInput(form.maxPerTrade))} />
        </div>
      )}
      {plan.intent && (
        <dl className="copy-plan">
          {plan.depositBase > 0n && <div><dt>{COPY.rows.deposit}</dt><dd>{usd(plan.depositBase)}</dd></div>}
          {plan.route === "new" ? <div><dt>{COPY.rows.runner}</dt><dd>{COPY.rows.runnerValue(plan.budgetBase, plan.perTradeBase, COPY_TERM_SEC / 86_400)}</dd></div> : <div><dt>{COPY.rows.shared}</dt><dd>{COPY.rows.runnerValue(plan.budgetBase, plan.perTradeBase, Math.max(0, Math.round(((writes.grant?.expiresAtSec ?? 0) - Date.now() / 1000) / 86_400)))}</dd></div>}
          {plan.carried.length > 0 && <div><dt>{COPY.rows.keeps}</dt><dd>{plan.carried.map((c) => c.name).join(", ")}</dd></div>}
          {plan.stops.length > 0 && <div data-tone="warn"><dt>{COPY.rows.stops}</dt><dd>{plan.stops.join(", ")}</dd></div>}
          <div><dt>{COPY.rows.fee}</dt><dd>{plan.feeBase === 0n ? COPY.rows.free : usd(plan.feeBase)}</dd></div>
          <div><dt>{COPY.rows.signatures}</dt><dd>1</dd></div>
        </dl>
      )}
    </div>
  );
}

/** The footer action: the TxCta when the plan can be sent; otherwise a button that shakes and says why. */
export function CopyCta({ card, form, writes, onDone }: { card: StrategyWire; form: CopyFormModel; writes: CopyWrites; onDone: () => void }) {
  const shell = useWalletShell();
  const [shake, setShake] = useState(0);
  const { plan } = form;
  if (!writes.signedIn) {
    return (
      <button type="button" data-primary-action="" className="strat-confirm copy-footer-cta" onClick={() => shell.openPicker("tempo", COPY.intent(form.cta, strategyIdentity(card).name))}>
        {form.cta}
      </button>
    );
  }
  if (plan.blockedBy || !plan.intent) {
    return (
      <div>
        <button key={shake} type="button" className="strat-confirm copy-footer-cta" data-blocked="" data-shake={shake > 0 ? "" : undefined} aria-disabled onClick={() => setShake((n) => n + 1)}>{form.cta}</button>
        {plan.blockedBy && <p className="copy-blocked" role="status">{plan.blockedBy}</p>}
      </div>
    );
  }
  const send = async () => {
    if (!plan.intent) return;
    const outcome = await writes.run(plan.intent);
    if (outcome?.status === "confirmed") onDone();
  };
  return <TxCta state={writes.tx.state} action={form.cta} signer={writes.signer} sponsored={false} onConfirm={() => void send()} />;
}
