"use client";
// R6 #9 (D-230): a copy whose budget can't cover one full-size call. The live runner skipped every call for its two
// copiers ("$0.02 left of its copy budget, under the smallest order of UP", 0 filled / 131 skipped) while the app said
// "Copying". This says so — the shared NoticeAlert (From 21st.dev 19366 corr/notice-alert, warning tone) — and fixes it in
// one tap: the session's own "Add to budget" (features/session `topUpBase`, to the daily cap), from the Trading Balance
// when it holds enough, else straight from the wallet — one root-signed transaction (`vault-fund-grant` /
// `vault-deposit-and-fund`), and every copy sharing the budget keeps running.
import { TxFailureCard } from "@/components/tx";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { notifyReceipt } from "@/features/receipts/write-receipt";
import { topUpBase } from "@/features/session/caps";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { budgetLow } from "./activity";
import { COPY } from "./copy";
import { usd } from "./format";
import type { CopyWrites } from "./useCopyWrites";
import "./copy-form.css";
import "./desk.css";

const T = COPY.topUp;

/** `failure`: show a failed send here (false where the host already shows the lane's failure). */
export function TopUpCopy({ writes, name, failure = true }: { writes: CopyWrites; name: string; failure?: boolean }) {
  const hidden = usePrivacy();
  const g = writes.grant;
  if (!g || g.revoked || g.expiresAtSec * 1000 <= Date.now() || !(g.budgetBase <= 0n || budgetLow(g))) return null;
  const amount = topUpBase(g);
  const fromBalance = (writes.availableBase ?? 0n) >= amount;
  const short = !fromBalance && writes.walletBase !== null && writes.walletBase < amount;
  const busy = writes.tx.state.kind === "signing" || writes.tx.state.kind === "submitted";
  const add = async () => {
    const outcome = await writes.run(fromBalance ? { kind: "vault-fund-grant", grantId: g.grantId, amountBase: amount } : { kind: "vault-deposit-and-fund", grantId: g.grantId, amountBase: amount });
    if (outcome?.status === "confirmed") {
      notifyReceipt({ title: T.done, figure: name, figureIsMoney: false, figureLabel: COPY.manage.receiptLabel, txHash: outcome.txHash, atMs: Date.now(), signer: writes.signer === "passkey" ? "passkey" : "wallet", sponsored: false });
    }
  };
  return (
    <div className="copy-topup">
      <NoticeAlert tone="warning" title={T.title(hidden ? SHELL.masked : usd(g.budgetBase))} description={T.why} />
      <button type="button" className="desk-btn-primary self-start" disabled={busy || short} onClick={() => void add()}>{T.cta(usd(amount))}</button>
      {short && <p className="copy-blocked" role="status">{COPY.form.walletShort(hidden ? null : writes.walletBase, amount)}</p>}
      {failure && writes.tx.state.kind === "failed" && <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} />}
    </div>
  );
}
