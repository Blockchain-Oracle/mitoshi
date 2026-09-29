"use client";
/**
 * Collect, at the top of Portfolio when there is anything to collect (ux-audit fix 4; Ported from Masayume
 * 68f7a09:web/src/features/markets/claims/{ClaimPlate,ClaimRow,ClaimSuccessReceipt}.tsx): one net figure, the rows,
 * and ONE confirm that collects everything in a sponsored batch (N-09) — the reference signed once per redemption. A
 * row the receive policy holds is listed with why and left out of the batch. The CTA names its own wait
 * ("Collecting…", not the references' "Placing…"), and the receipt lists each batch transaction that landed.
 */
import type { Address, ClaimableRow } from "@cwf/core";
import { netClaimableSum, OUTCOME_TO_SIDE } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { secToMs, shortHex } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { useState } from "react";
import { Money, UtcTime } from "@/components/data";
import { Receipt, ReceiptRow } from "@/components/receipt";
import { TxCta, TxFailureCard } from "@/components/tx";
import { webEnv } from "@/lib/env";
import { CLAIM } from "../copy";
import { collectableRows, useCollect } from "./useCollect";

function Row({ row }: { row: ClaimableRow }) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-1 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="type-body-strong text-ink">{row.asset} · {formatCadence(row.intervalSec)}</span>
          <span className="type-caption text-ink-secondary">
            {row.heldByReceivePolicy ? CLAIM.held : (CLAIM.kind[row.kind] ?? row.kind)} · {row.settledAtMs === null ? CLAIM.closed : CLAIM.settled} <UtcTime ms={row.settledAtMs ?? secToMs(row.expirySec)} withSeconds={false} />
          </span>
        </div>
        <Money value={row.netPayoutBase} decimals={row.decimals} className="type-data-lg text-ink" />
      </div>
      {row.legs.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {row.legs.map((leg) => (
            <li key={leg.outcomeIdx} className="flex flex-wrap items-baseline gap-x-2 type-caption text-ink-secondary">
              <span className="text-ink">{CLAIM.leg[OUTCOME_TO_SIDE[leg.outcomeIdx]]}</span>
              <Money value={leg.amountRaw} decimals={row.decimals} maxDp={2} /> {CLAIM.contracts} <span aria-hidden>→</span> <Money value={leg.payoutBase} decimals={row.decimals} className="text-ink" />
            </li>
          ))}
        </ul>
      ) : null}
      {row.heldByReceivePolicy ? <p className="type-caption text-ink-secondary">{CLAIM.heldNote}</p> : null}
    </li>
  );
}

export function CollectPlate({ wallet, rows }: { wallet: Address; rows: readonly ClaimableRow[] }) {
  const { tx, collect, reset } = useCollect(wallet);
  const [receipt, setReceipt] = useState<{ hashes: `0x${string}`[]; paidBase: bigint; atMs: number; count: number } | null>(null);
  const live = collectableRows(rows);
  const sum = netClaimableSum(live);
  const decimals = rows[0]?.decimals ?? 6;
  const batches = Math.max(1, Math.ceil(live.length / 8));

  const run = async () => {
    const outcome = await collect(live);
    if (outcome?.status === "confirmed") setReceipt({ hashes: outcome.txHashes ?? [outcome.txHash], paidBase: sum, atMs: Date.now(), count: live.length });
  };

  return (
    <div className="flex flex-col gap-4">
      {live.length > 0 || rows.length > 0 ? (
        <section aria-labelledby="collect-title" className="flex flex-col gap-4 rounded-(--claim-plate-radius) border border-(--claim-plate-border) bg-(--claim-plate-surface) p-4">
          <header className="flex flex-col gap-1">
            <h2 id="collect-title" className="type-title text-ink">{CLAIM.title}</h2>
            <p className="type-caption text-ink-secondary">{CLAIM.waiting(rows.length)}</p>
          </header>
          {live.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <Money value={sum} decimals={decimals} className="type-data-lg text-ink" />
              <span className="type-label-micro text-ink-secondary">{CLAIM.netLabel}</span>
            </div>
          ) : null}
          <ul className="flex flex-col gap-2">{rows.map((r) => <Row key={r.marketId} row={r} />)}</ul>
          {tx.kind === "failed" ? <TxFailureCard state={tx} onRetry={reset} /> : null}
          {live.length > 0 ? (
            <div className="flex flex-col gap-2">
              <TxCta state={tx.kind === "failed" || tx.kind === "confirmed" ? { kind: "idle" } : tx} action={CLAIM.collectAll} signer="passkey" sponsored onConfirm={() => void run()} />
              <p className="type-caption text-ink-secondary">{CLAIM.oneBatch(batches)}</p>
            </div>
          ) : null}
        </section>
      ) : null}
      {receipt ? (
        <Receipt title={CLAIM.receipt.title} figure={<Money value={receipt.paidBase} decimals={decimals} />} figureLabel={CLAIM.receipt.figureLabel} settledAtMs={receipt.atMs}>
          <ReceiptRow label={CLAIM.done(receipt.count)}>{""}</ReceiptRow>
          {receipt.hashes.map((h, i) => (
            <ReceiptRow key={h} label={CLAIM.receipt.batch(i + 1)} href={txUrl(h, webEnv.markets.network)}>{shortHex(h)}</ReceiptRow>
          ))}
        </Receipt>
      ) : null}
    </div>
  );
}
