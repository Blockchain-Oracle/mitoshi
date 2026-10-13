"use client";
/**
 * Collect (ux-audit fix 4; Ported from Masayume 68f7a09:web/src/features/markets/claims/{ClaimPlate,ClaimRow,
 * ClaimSuccessReceipt}.tsx; R4-4, D-227 in Owarine 90a91d71's LiveClaimPlate grammar): the rows as the bets' two-line
 * rows in one plate — the Window and what it is, then its legs and its net — and at the plate's foot ONE confirm that
 * collects everything in a sponsored batch (N-09). A row the receive policy holds is listed with why and left out of
 * the batch; a Boost payout the policy refused (held by the reserve) is its own row with its own Collect. `bare` drops
 * the inner header where the page's section header already names it (/portfolio's "To collect"). The receipt lists
 * each batch transaction that landed. Every amount wears the privacy mask.
 */
import type { Address, ClaimableRow } from "@cwf/core";
import { netClaimableSum, OUTCOME_TO_SIDE } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { shortHex } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { useState } from "react";
import { Masked } from "@/components/kit/Masked";
import { PillButton } from "@/components/kit/PillButton";
import { Receipt, ReceiptRow } from "@/components/receipt";
import { TxCta, TxFailureCard } from "@/components/tx";
import { BOOST } from "@/features/boost/copy";
import { money } from "@/features/terminal/format";
import { SHELL } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { usePrivacy } from "@/lib/privacy";
import { CLAIM } from "../copy";
import { collectableRows, useCollect } from "./useCollect";
import "@/components/kit/kit.css";

const usd = (base: bigint, decimals: number) => <Masked>{money(base, false, decimals)}</Masked>;

function Row({ row }: { row: ClaimableRow }) {
  return (
    <li className="bets-row">
      <span className="type-body-strong text-ink">{row.asset}</span>
      <span className="type-label-micro text-ink-muted">{formatCadence(row.intervalSec)}</span>
      <span className="type-label-micro text-ink-secondary">{row.heldByReceivePolicy ? CLAIM.held : (CLAIM.kind[row.kind] ?? row.kind)}</span>
      <span className="bets-break" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 type-caption text-ink-secondary">
        {row.legs.map((leg) => (
          <span key={leg.outcomeIdx} className="numbers">
            {CLAIM.leg[OUTCOME_TO_SIDE[leg.outcomeIdx]]} → {usd(leg.payoutBase, row.decimals)}
          </span>
        ))}
        {row.heldByReceivePolicy ? <span>{CLAIM.heldNote}</span> : null}
      </span>
      <span className="type-data numbers text-ink">{usd(row.netPayoutBase, row.decimals)}</span>
    </li>
  );
}

export interface BoostOwed {
  amountBase: bigint;
  busy: boolean;
  collect: () => void;
}

export function CollectPlate({ wallet, rows, bare = false, collector, boostOwed }: { wallet: Address; rows: readonly ClaimableRow[]; bare?: boolean; collector?: ReturnType<typeof useCollect>; boostOwed?: BoostOwed | null }) {
  const own = useCollect(collector ? null : wallet);
  const { tx, collect, reset } = collector ?? own;
  const [receipt, setReceipt] = useState<{ hashes: `0x${string}`[]; paidBase: bigint; atMs: number; count: number } | null>(null);
  const live = collectableRows(rows);
  const sum = netClaimableSum(live);
  const decimals = rows[0]?.decimals ?? 6;
  const batches = Math.max(1, Math.ceil(live.length / 8));
  const owed = boostOwed && boostOwed.amountBase > 0n ? boostOwed : null;
  // The owed row's button names its amount — the dots in privacy mode, like the row beside it.
  const hidden = usePrivacy();

  const run = async () => {
    const outcome = await collect(live);
    if (outcome?.status === "confirmed") setReceipt({ hashes: outcome.txHashes ?? [outcome.txHash], paidBase: sum, atMs: Date.now(), count: live.length });
  };

  if (rows.length === 0 && !owed && !receipt) return null;
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 || owed ? (
        <section aria-label={CLAIM.title} className="bets-plate">
          {bare ? null : (
            <header className="flex flex-col gap-1">
              <h2 className="type-title text-ink">{CLAIM.title}</h2>
              <p className="type-caption text-ink-secondary">{CLAIM.waiting(rows.length)}</p>
            </header>
          )}
          <ul className="bets-list">
            {rows.map((r) => <Row key={r.marketId} row={r} />)}
            {owed ? (
              <li className="bets-row">
                <span className="min-w-0 flex-1 type-caption text-ink"><Masked>{BOOST.bets.owed(money(owed.amountBase))}</Masked></span>
                <PillButton tone="ghost" size="sm" disabled={owed.busy} aria-busy={owed.busy} onClick={owed.collect}>{BOOST.bets.collect(hidden ? SHELL.masked : money(owed.amountBase))}</PillButton>
              </li>
            ) : null}
          </ul>
          {live.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-hairline">
              <p className="flex items-baseline justify-between gap-3">
                <span className="type-label-micro text-ink-secondary">{CLAIM.netLabel}</span>
                <span className="type-data-lg numbers text-ink">{usd(sum, decimals)}</span>
              </p>
              {tx.kind === "failed" ? <TxFailureCard state={tx} onRetry={reset} /> : null}
              <TxCta state={tx.kind === "failed" || tx.kind === "confirmed" ? { kind: "idle" } : tx} action={CLAIM.collectAll} signer="passkey" sponsored onConfirm={() => void run()} />
              <p className="type-caption text-ink-secondary">{CLAIM.oneBatch(batches)}</p>
            </div>
          ) : null}
        </section>
      ) : null}
      {receipt ? (
        <Receipt title={CLAIM.receipt.title} figure={usd(receipt.paidBase, decimals)} figureLabel={CLAIM.receipt.figureLabel} settledAtMs={receipt.atMs}>
          <ReceiptRow label={CLAIM.done(receipt.count)}>{""}</ReceiptRow>
          {receipt.hashes.map((h, i) => (
            <ReceiptRow key={h} label={CLAIM.receipt.batch(i + 1)} href={txUrl(h, webEnv.markets.network)}>{shortHex(h)}</ReceiptRow>
          ))}
        </Receipt>
      ) : null}
    </div>
  );
}
