"use client";
/**
 * The earn action card (R4-7, D-227; earn spec step 5) — Owarine 90a91d71 `features/earn/SupplyCards.tsx`'s SupplyCard
 * and PositionCard's Withdraw as one card: a Supply | Withdraw switch (Withdraw only once there are shares), the amount
 * with Max inside, the quick amounts, one button. Withdraw takes a partial amount (Mitoshi's Trading Balance already
 * does, E.5 S7): the shares are `withdrawSharesFor` (floored, capped at what idle capital covers; Max sends exactly the
 * idle shares), and a mini bar shows what can leave against what is out working. Signed out the card composes as if
 * signed in and its button opens sign-in for that supply (D-224). The button rides `SheetFooter`: inline it renders in
 * place, in the phone sheet it is the pinned footer.
 */
import { withdrawSharesFor, type ReserveSheet, type SupplierPosition, type TxState } from "@cwf/core";
import { useState } from "react";
import { CapitalBar, PillButton } from "@/components/kit";
import { TxCta, TxFailureCard, type SignerKind, type TxRunner } from "@/components/tx";
import { SheetFooter } from "@/components/ui/overlay-footer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { AmountRow } from "./AmountRow";
import { EARN } from "./copy";
import { amountBase, money2, quickAmounts } from "./format";
import type { ReserveWords } from "./reserves";
import type { EarnWrites } from "./useEarnWrites";

const idleOr = (tx: TxRunner, blocker: string | null): TxState => (blocker ? { kind: "blocked", reason: blocker } : tx.state.kind === "confirmed" ? { kind: "idle" } : tx.state);

type Mode = "supply" | "withdraw";

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

function SupplyPanel({ sheet, writes, signedIn, signer, walletBase, onSignIn, keypad }: ActionCardProps) {
  const { supply } = EARN;
  const [amount, setAmount] = useState("");
  const { decimals, paused } = sheet;
  const wallet = walletBase ?? 0n;
  // Privacy mode (the balance eye): the account's figure is the dots, and the chips stop being quarters of it.
  const hidden = usePrivacy();
  const base = amountBase(amount, decimals);
  const blocker = paused
    ? supply.paused
    : base <= 0n
      ? supply.enterAmount
      : !signedIn
        ? null
        : walletBase === null
          ? supply.walletReading
          : wallet <= 0n
            ? supply.noFunds
            : base > wallet
              ? supply.over(hidden ? SHELL.masked : money2(wallet, decimals))
              : null;
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
          {quickAmounts(signedIn && !hidden ? wallet : 0n, decimals).map((a) => (
            <button key={a} type="button" onClick={() => setAmount(a)} aria-pressed={amount === a} className="ea-quick-chip numbers">
              {a}
            </button>
          ))}
        </div>
      )}
      <SheetFooter>
        <TxCta state={idleOr(tx, blocker)} action={supply.button(money2(base, decimals))} signer={signer} onConfirm={confirm} className="ea-cta" />
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
  const base = maxed ? held.idleBase : amountBase(amount, decimals);
  const shares = maxed ? held.idleShares : withdrawSharesFor(held, base);
  const blocker = held.idleShares <= 0n ? withdraw.over(money2(0n, decimals)) : base <= 0n || shares <= 0n ? EARN.supply.enterAmount : base > held.idleBase ? withdraw.over(hidden ? SHELL.masked : money2(held.idleBase, decimals)) : null;
  const tx = writes.withdrawTx;
  const confirm = () => void writes.withdraw(shares).then((ok) => ok && type(""));
  const usd = (b: bigint) => money2(b, decimals);
  const own = (b: bigint) => (hidden ? SHELL.masked : usd(b));
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
          <PillButton tone="accent" size="lg" block disabled aria-busy className="ea-cta">
            {writes.note}
          </PillButton>
        ) : (
          <TxCta state={idleOr(tx, blocker)} action={withdraw.button(usd(base))} signer={signer} sponsored onConfirm={confirm} className="ea-cta" />
        )}
      </SheetFooter>
      {tx.state.kind === "failed" ? (
        tx.state.diagnosis.kind === "receive-policy" ? <p role="alert" className="ea-micro">{withdraw.receivePolicy}</p> : <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} />
      ) : null}
    </>
  );
}
