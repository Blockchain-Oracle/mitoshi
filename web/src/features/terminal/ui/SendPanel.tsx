"use client";
// The account drawer's Withdraw (S23g; Tradash's Withdraw, Owarine's `SendPanel` in shape): pathUSD from the wallet to
// any Tempo address, one unsponsored transfer the account's own passkey signs — never a one-tap key (money leaving the
// account always asks). Amounts are integer base units; the address is checked before anything is signed.
import { TEMPO } from "@cwf/clients";
import { diagnosisCopy } from "@cwf/core/copy";
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { invalidateAfterWrite, useSubmitter } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { webEnv } from "@/lib/env";
import { notify } from "@/lib/toast";
import { TERMINAL } from "../copy";
import { money, USD_DECIMALS } from "../format";

export function SendPanel({ wallet, balanceBase, onDone }: { wallet: Address; balanceBase: bigint | null; onDone: () => void }) {
  const submitter = useSubmitter();
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const amountBase = parseDecimalToBaseUnits(amount, USD_DECIMALS) ?? 0n;
  const addressOk = isAddress(to.trim()) && to.trim().toLowerCase() !== wallet.toLowerCase();
  const over = balanceBase !== null && amountBase > balanceBase;
  const problem = to.trim() && !addressOk ? TERMINAL.send.badAddress : over ? TERMINAL.send.overBalance : null;

  const send = async () => {
    if (!submitter || !addressOk || amountBase <= 0n || over || busy) return;
    setBusy(true);
    const id = "terminal-send";
    notify.item({ id, type: "loading", title: TERMINAL.send.sending });
    try {
      const outcome = await submitter.submitTx({ kind: "transfer", token: TEMPO.pathUSD as Address, to: to.trim() as Address, amountBase });
      if (outcome.status === "confirmed") {
        void invalidateAfterWrite(queryClient, { wallet });
        const hash = outcome.txHashes?.at(-1) ?? null;
        notify.item({ id, title: TERMINAL.send.sent(money(amountBase)), ...(hash ? { action: { label: TERMINAL.send.receipt, onClick: () => window.open(txUrl(hash, webEnv.markets.network), "_blank", "noopener") } } : {}) });
        onDone();
        return;
      }
      notify.item({ id, type: "warning", title: TERMINAL.send.failed, ...("diagnosis" in outcome ? { description: diagnosisCopy(outcome.diagnosis.kind).headline } : {}) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tm-send">
      <label className="tm-field">
        <span className="tm-field-head">{TERMINAL.send.to}</span>
        <input className="tm-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" />
        <span className="tm-field-hint">{TERMINAL.send.toHint}</span>
      </label>
      <label className="tm-field">
        <span className="tm-field-head">
          {TERMINAL.send.amount}
          <button type="button" className="tm-choice" disabled={balanceBase === null} onClick={() => balanceBase !== null && setAmount(formatBaseUnits(balanceBase, USD_DECIMALS, { group: false, minDp: 0, maxDp: 6 }))}>{TERMINAL.send.max}</button>
        </span>
        <input className="tm-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </label>
      {problem ? <p role="alert" className="tm-field-hint tm-warn">{problem}</p> : null}
      <p className="tm-field-hint">{TERMINAL.send.fee}</p>
      <button type="button" className="tm-btn tm-btn-cta" disabled={!addressOk || amountBase <= 0n || over || busy || !submitter} onClick={() => void send()}>
        {busy ? TERMINAL.send.sending : TERMINAL.send.cta(money(amountBase))}
      </button>
    </div>
  );
}
