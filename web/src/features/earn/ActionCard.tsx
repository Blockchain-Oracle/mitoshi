"use client";
/**
 * The earn action card (R4-7, D-227; earn spec step 5) — Owarine 90a91d71 `features/earn/SupplyCards.tsx`'s SupplyCard
 * and PositionCard's Withdraw as one card: a Supply | Withdraw switch (Withdraw only once there are shares), the amount
 * with Max inside, the quick amounts, one button. Withdraw takes a partial amount (Mitoshi's Trading Balance already
 * does, E.5 S7): the shares are `withdrawSharesFor` (floored, capped at what idle capital covers; Max sends exactly the
 * idle shares). Signed out the card composes as if signed in and its button opens sign-in for that supply (D-224). The
 * button rides `SheetFooter`: inline it renders in place, in the phone sheet it is the pinned footer.
 * R6 money (T06 + T07, D-230): a blocker that names its fix is the action (states-kit `BlockedCta` through `TxCta`):
 * "Use $100" fills the field, "Add money" opens Add money, "Withdraw all $X" maxes it — the reason is the caption under
 * it; only a block with no fix (paused, nothing idle) is a stated, disabled face. The account's read is a pill-shaped
 * skeleton, then a named wait with its seconds and Retry (`AccountWait`) — never a sentence in an empty box.
 */
import { withdrawSharesFor, type ReserveSheet, type SupplierPosition, type TxState } from "@cwf/core";
import type { BlockerCopy } from "@cwf/core/copy";
import { formatBaseUnits } from "@cwf/core/units";
import { useState } from "react";
import { CapitalBar } from "@/components/kit/CapitalBar";
import type { HostFix } from "@/components/states/BlockedCta";
import { TxCta, TxFailureCard, type SignerKind, type TxRunner } from "@/components/tx";
import { SheetFooter } from "@/components/ui/overlay-footer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { AccountWait, NamedWait } from "./AccountWait";
import { AmountRow } from "./AmountRow";
import { EARN } from "./copy";
import { amountBase, money2, quickAmounts } from "./format";
import type { ReserveWords } from "./reserves";
import type { EarnWrites } from "./useEarnWrites";
import "@/components/kit/kit.css";

type Mode = "supply" | "withdraw";

/** What the CTA is right now: the order, a block (with the fix that clears it, when there is one), or a wait. */
type Gate = { kind: "go" } | { kind: "blocked"; blocker: BlockerCopy; fix?: HostFix } | { kind: "wait" };

const blockedState = (tx: TxRunner, gate: Gate): TxState => (gate.kind === "blocked" ? { kind: "blocked", reason: gate.blocker.label } : tx.state.kind === "confirmed" ? { kind: "idle" } : tx.state);

export interface ActionCardProps {
  sheet: ReserveSheet;
  words: ReserveWords;
  writes: EarnWrites;
  signedIn: boolean;
  signer: SignerKind;
  /** pathUSD in the account; null while it is being read. */
  walletBase: bigint | null;
  held: SupplierPosition;
  /** Maker only: a closed Window the withdraw settles first. */
  unsettledExpired?: boolean;
  onSignIn: (intent: string) => void;
  /** The phone sheet: the keypad instead of the OS keyboard. */
  keypad?: boolean;
  className?: string;
}

export function ActionCard(props: ActionCardProps) {
  const { signedIn, held, keypad = false, className } = props;
  const [chosen, setChosen] = useState<Mode>("supply");
  const canWithdraw = signedIn && held.shares > 0n;
  const mode: Mode = canWithdraw ? chosen : "supply";
  return (
    <div className={cn("ea-action", keypad && "ea-action--sheet", className)} data-primary-action="">
      {canWithdraw ? (
        <SegmentedControl
          label={EARN.action.label}
          value={mode}
          onValueChange={setChosen}
          options={[
            { value: "supply", label: EARN.action.supply },
            { value: "withdraw", label: EARN.action.withdraw },
          ]}
          className="ea-switch"
        />
      ) : null}
      {mode === "supply" ? <SupplyPanel {...props} keypad={keypad} /> : <WithdrawPanel {...props} keypad={keypad} />}
    </div>
  );
}

const HUNDRED = 100n;

/** The figure "Use $X" fills in: $100, or the account's whole dollars when it holds less. */
function suggested(wallet: bigint | null, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  return wallet !== null && wallet > 0n && wallet < HUNDRED * unit ? String(wallet / unit) : String(HUNDRED);
}

function SupplyPanel({ sheet, writes, signedIn, signer, walletBase, onSignIn, keypad }: ActionCardProps) {
  const { supply } = EARN;
  const [amount, setAmount] = useState("");
  const { decimals, paused } = sheet;
  // Privacy mode (the balance eye): the account's figure is the dots, and the chips stop being quarters of it.
  const hidden = usePrivacy();
  const own = (b: bigint) => (hidden ? SHELL.masked : money2(b, decimals));
  const base = amountBase(amount, decimals);
  const reading = signedIn && walletBase === null;
  const empty = signedIn && walletBase !== null && walletBase <= 0n;
  const fill = (text: string): HostFix => ({ label: supply.use(hidden ? SHELL.masked : `$${text}`), run: () => setAmount(text) });
  const gate: Gate = paused
    ? { kind: "blocked", blocker: { label: supply.paused, reason: supply.pausedWhy, fix: null } }
    : reading
      ? { kind: "wait" }
      : empty
        ? { kind: "blocked", blocker: { label: supply.addMoney, reason: supply.holds(own(0n)), fix: { kind: "add-money", label: supply.addMoney } } }
        : base <= 0n
          ? { kind: "blocked", blocker: { label: supply.noAmount, reason: supply.noAmount, fix: null }, fix: fill(suggested(walletBase, decimals)) }
          : signedIn && walletBase !== null && base > walletBase
            ? { kind: "blocked", blocker: { label: supply.holds(own(walletBase)), reason: supply.holds(own(walletBase)), fix: null }, fix: fill(formatBaseUnits(walletBase, decimals, { minDp: 0, maxDp: 2, group: false })) }
            : { kind: "go" };
  const confirm = () => {
    if (!signedIn) return onSignIn(supply.signInFor(money2(base, decimals)));
    // Cleared only once the supply lands; a refused signature keeps the figure.
    void writes.supply(base).then((ok) => ok && setAmount(""));
  };
  const tx = writes.supplyTx;
  return (
    <>
      <AmountRow value={amount} onChange={setAmount} maxBase={signedIn ? walletBase : null} label={supply.amount} over={supply.over} hint={supply.wallet} keypad={keypad} />
      {keypad ? null : (
        <div className="ea-quick">
          {quickAmounts(signedIn && !hidden ? (walletBase ?? 0n) : 0n, decimals).map((a) => (
            <button key={a} type="button" onClick={() => setAmount(a)} aria-pressed={amount === a} className="ea-quick-chip numbers">
              {a}
            </button>
          ))}
        </div>
      )}
      <SheetFooter>
        {gate.kind === "wait" ? (
          <AccountWait />
        ) : (
          <TxCta state={blockedState(tx, gate)} blocker={gate.kind === "blocked" ? gate.blocker : undefined} fix={gate.kind === "blocked" ? gate.fix : undefined} action={supply.button(money2(base, decimals))} signer={signer} onConfirm={confirm} className="ea-cta" />
        )}
      </SheetFooter>
      {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
    </>
  );
}

function WithdrawPanel({ sheet, words, writes, signer, held, unsettledExpired = false, keypad }: ActionCardProps) {
  const { withdraw } = EARN;
  const [amount, setAmount] = useState("");
  // Max sends exactly the idle shares (and names exactly what is idle), even where the field holds cents (the keypad).
  const [maxed, setMaxed] = useState(false);
  const type = (text: string) => {
    setAmount(text);
    setMaxed(false);
  };
  const { decimals } = sheet;
  const hidden = usePrivacy();
  const own = (b: bigint) => (hidden ? SHELL.masked : money2(b, decimals));
  const base = maxed ? held.idleBase : amountBase(amount, decimals);
  const shares = maxed ? held.idleShares : withdrawSharesFor(held, base);
  const max: HostFix = { label: "", run: () => (setAmount(formatBaseUnits(held.idleBase, decimals, { minDp: 0, maxDp: 2, group: false })), setMaxed(true)) };
  const gate: Gate =
    held.idleShares <= 0n
      ? { kind: "blocked", blocker: { label: withdraw.nothingIdle, reason: withdraw.nothingIdleWhy, fix: null } }
      : base <= 0n || shares <= 0n
        ? { kind: "blocked", blocker: { label: EARN.supply.noAmount, reason: EARN.supply.noAmount, fix: null }, fix: { ...max, label: withdraw.all(own(held.idleBase)) } }
        : base > held.idleBase
          ? { kind: "blocked", blocker: { label: withdraw.overWhy(own(held.idleBase)), reason: withdraw.overWhy(own(held.idleBase)), fix: null }, fix: { ...max, label: withdraw.toIdle(own(held.idleBase)) } }
          : { kind: "go" };
  const tx = writes.withdrawTx;
  const confirm = () => void writes.withdraw(shares).then((ok) => ok && type(""));
  return (
    <>
      <AmountRow value={amount} onChange={type} onMax={() => setMaxed(true)} maxBase={held.idleBase} label={withdraw.amount} over={withdraw.over} hint={withdraw.idle} keypad={keypad} />
      <CapitalBar
        label={withdraw.withdrawable}
        format={own}
        className="ea-mini"
        segments={[
          { id: "idle", label: withdraw.withdrawable, valueBase: held.idleBase, color: "var(--ea-idle)" },
          { id: "committed", label: words.committed, valueBase: held.committedBase, color: "var(--color-accent)" },
        ]}
      />
      {unsettledExpired ? <p className="ea-micro">{withdraw.unsettled}</p> : null}
      <SheetFooter>
        {writes.note ? (
          <NamedWait>{writes.note}</NamedWait>
        ) : (
          <TxCta state={blockedState(tx, gate)} blocker={gate.kind === "blocked" ? gate.blocker : undefined} fix={gate.kind === "blocked" ? gate.fix : undefined} action={withdraw.button(money2(base, decimals))} signer={signer} sponsored onConfirm={confirm} className="ea-cta" />
        )}
      </SheetFooter>
      {tx.state.kind === "failed" ? (
        tx.state.diagnosis.kind === "receive-policy" ? <p role="alert" className="ea-micro">{withdraw.receivePolicy}</p> : <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} />
      ) : null}
    </>
  );
}
