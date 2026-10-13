"use client";
/**
 * The two §01 cards (Owarine 90a91d71 `features/earn/SupplyCards.tsx`): supply — the amount, Max, quick amounts scaled
 * to the account, one CTA — and your position — value, shares at the share price, Withdraw of what is idle, realized
 * and on-paper (A-2c). Signed out, the supply card composes as if signed in and its CTA opens sign-in for that supply
 * (D-224). Every write runs through the TxLifecycle: the CTA names its blocker, then the lane's own words.
 */
import { canConfirm, formatBaseUnits, parseDecimalToBaseUnits, realizedYield, supplierPosition, type ReserveSheet, type TxState } from "@cwf/core";
import type { SupplyLedger } from "@cwf/markets/maker";
import { useState } from "react";
import { ctaLabel, TX, TxCta, TxFailureCard, type SignerKind, type TxRunner } from "@/components/tx";
import { Masked } from "@/components/kit";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { EARN } from "./copy";
import { formatSharePrice, money2, quickAmounts } from "./format";
import type { ReserveWords } from "./reserves";

const idleOr = (tx: TxRunner, blocker: string | null): TxState => (blocker ? { kind: "blocked", reason: blocker } : tx.state.kind === "confirmed" ? { kind: "idle" } : tx.state);

interface SupplyCardProps {
  signedIn: boolean;
  signer: SignerKind;
  sheet: ReserveSheet;
  /** pathUSD in the account; null while it is being read. */
  walletBase: bigint | null;
  tx: TxRunner;
  onSupply: (amountBase: bigint) => Promise<boolean>;
  onSignIn: (intent: string) => void;
}

export function SupplyCard({ signedIn, signer, sheet, walletBase, tx, onSupply, onSignIn }: SupplyCardProps) {
  const { supply } = EARN;
  const [amount, setAmount] = useState("");
  const { decimals, paused } = sheet;
  const wallet = walletBase ?? 0n;
  // Privacy mode: the account's figure is the dots, and the quick chips stop being quarters of it (the last one was it).
  const hidden = usePrivacy();
  const held = hidden ? SHELL.masked : money2(wallet, decimals);
  const base = parseDecimalToBaseUnits(amount.trim() || "0", decimals) ?? 0n;
  const blocker = paused
    ? EARN.paused.title
    : amount.trim() === "" || base <= 0n
      ? supply.enterAmount
      : !signedIn
        ? null
        : walletBase === null
          ? supply.walletReading
          : wallet <= 0n
            ? supply.noFunds
            : base > wallet
              ? supply.over(held)
              : null;
  const confirm = () => {
    if (!signedIn) return onSignIn(supply.signInFor(money2(base, decimals)));
    // Cleared only once the supply lands; a refused signature keeps the figure.
    void onSupply(base).then((ok) => ok && setAmount(""));
  };
  return (
    <div className="earn-card ea-card">
      <div className="ea-field-head">
        <span className="ea-k">{supply.amount}</span>
        <span className="ea-wallet numbers">{signedIn ? (walletBase === null ? supply.walletPending : supply.wallet(held)) : null}</span>
      </div>
      <div className="earn-field ea-field">
        <span className="ea-input-unit" aria-hidden>$</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" inputMode="decimal" autoComplete="off" className="ea-input numbers" aria-label={supply.amount} />
        <button type="button" onClick={() => setAmount(formatBaseUnits(wallet, decimals, { minDp: 2, maxDp: 2, group: false }))} disabled={!signedIn || walletBase === null || wallet <= 0n} className="ea-max">
          {supply.max}
        </button>
      </div>
      <div className="ea-quick">
        {quickAmounts(signedIn && !hidden ? wallet : 0n, decimals).map((a) => (
          <button key={a} type="button" onClick={() => setAmount(a)} className={cn("ea-quick-chip numbers", amount === a ? "ea-quick-chip--on" : "earn-chip")}>
            {a}
          </button>
        ))}
      </div>
      <TxCta state={idleOr(tx, blocker)} action={supply.button(money2(base, decimals))} signer={signer} onConfirm={confirm} className="ea-supply" />
      {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
    </div>
  );
}

interface PositionCardProps {
  signedIn: boolean;
  signer: SignerKind;
  sheet: ReserveSheet;
  words: ReserveWords;
  shares: bigint;
  worthBase: bigint;
  /** The wallet's lifetime counters from the reserve's events; null while they are being read. */
  ledger: SupplyLedger | null;
  /** Maker only: a closed Window the exit has to settle first, which the note names before it is sent. */
  unsettledExpired?: boolean;
  tx: TxRunner;
  /** What the withdraw is doing first ("Settling a closed Window first…"), when it is. */
  note: string | null;
  onWithdraw: (shares: bigint) => void;
}

/**
 * Your position: value, shares at the share price, Withdraw. Every reserve pays a withdrawal out of free capital only,
 * so the button takes what is free and the note names what the reserve is still holding, in that reserve's own word.
 */
export function PositionCard({ signedIn, signer, sheet, words, shares, worthBase, ledger, unsettledExpired = false, tx, note, onWithdraw }: PositionCardProps) {
  const { position } = EARN;
  const { decimals } = sheet;
  const held = supplierPosition(sheet, shares, worthBase);
  // A-2c: what has actually been paid back above cost, and what is still only a mark. Never a rate, never a forecast.
  const earned = ledger ? realizedYield({ suppliedBase: ledger.suppliedBase, withdrawnBase: ledger.withdrawnBase, worthBase }) : null;
  const onPaperText = earned ? money2(earned.unrealizedBase, decimals) : "";
  // A difference under a cent is not a loss: it is the floor in the share arithmetic, so it reads as level.
  const onPaperZero = earned ? (parseDecimalToBaseUnits(onPaperText.slice(1), decimals) ?? 0n) === 0n : true;
  const onPaper = !earned ? null : onPaperZero ? { tone: "ea-earned-v", text: position.unrealizedFlat } : earned.unrealizedBase < 0n ? { tone: "ea-earned-v ea-earned-v--down", text: position.unrealizedDown(onPaperText) } : { tone: "ea-earned-v ea-earned-v--up", text: position.unrealized(onPaperText) };
  const state = idleOr(tx, null);
  // Privacy mode (R4-4, critic gap 15): the withdrawable amount in the button hides with every other figure.
  const hidden = usePrivacy();
  const action = held.committedBase === 0n ? position.withdrawAll : position.withdrawIdle(hidden ? SHELL.masked : money2(held.idleBase, decimals));
  const nothing = held.shares <= 0n && (earned === null || earned.realizedBase <= 0n);
  return (
    <div className="earn-card ea-card">
      <div className="ea-k ea-position-title">{position.title}</div>
      {!signedIn ? (
        <p className="ea-empty">{position.connect}</p>
      ) : nothing ? (
        <p className="ea-empty">{ledger === null && shares <= 0n ? position.ledgerReading : position.empty}</p>
      ) : (
        <>
          <div className="ea-position-value numbers"><Masked>{money2(held.worthBase, decimals)}</Masked></div>
          <div className="ea-position-sub numbers"><Masked>{position.shares(formatBaseUnits(held.shares, decimals, { minDp: 2, maxDp: 2 }), formatSharePrice(sheet.sharePriceRaw, decimals))}</Masked></div>
          <button type="button" onClick={() => onWithdraw(held.idleShares)} disabled={!canConfirm(state) || held.idleShares === 0n} aria-busy={state.kind === "signing" || state.kind === "submitted"} className="earn-ghost ea-withdraw">
            {note ?? ctaLabel(state, action, signer)}
          </button>
          {state.kind === "idle" && held.idleShares > 0n ? <p className="ea-note">{TX.noFees}</p> : null}
          {tx.state.kind === "failed" ? (
            tx.state.diagnosis.kind === "receive-policy" ? <p role="alert" className="ea-note">{position.receivePolicy}</p> : <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} />
          ) : null}
          <dl className="ea-earned">
            <div>
              <dt className="ea-k">{position.realizedLabel}</dt>
              <dd className={earned && earned.realizedBase > 0n ? "ea-earned-v ea-earned-v--up numbers" : "ea-earned-v"}>
                {earned === null ? position.ledgerReading : earned.realizedBase > 0n ? <Masked>{position.realized(money2(earned.realizedBase, decimals))}</Masked> : position.realizedNone}
              </dd>
            </div>
            {held.shares > 0n && onPaper ? (
              <div>
                <dt className="ea-k">{position.unrealizedLabel}</dt>
                <dd className={cn(onPaper.tone, !onPaperZero && "numbers")}><Masked>{onPaper.text}</Masked></dd>
              </div>
            ) : null}
          </dl>
          {held.committedBase > 0n ? <p className="ea-note">{words.committedNote(hidden ? SHELL.masked : money2(held.committedBase, decimals))}</p> : null}
          {unsettledExpired ? <p className="ea-note">{position.unsettledNote}</p> : null}
        </>
      )}
    </div>
  );
}
