"use client";
// The funding receipt (D-045: every value move gets one): the balance read after the claim is the figure — never an
// assumed amount — and each faucet transfer links to the explorer.
import type { Hex } from "@cwf/core";
import { useBalanceSheet } from "@cwf/markets/react";
import { TxReceipt } from "@/components/tx";
import { webEnv } from "@/lib/env";
import { dollars } from "@/providers/wallet/format";
import { txUrl, type Address } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import { FUNDING } from "./copy";

export function FundedReceipt({ address, txHashes, atMs }: { address: Address; txHashes: readonly Hex[]; atMs: number }) {
  const sheet = useBalanceSheet(address);
  const network = webEnv.markets.network;
  // Transfers in order: the first n−1 as rows, the last as the receipt's transaction row.
  const last = txHashes.at(-1);
  if (!last) return null;
  const earlier = txHashes.slice(0, -1);
  return (
    <TxReceipt
      title={FUNDING.receipt.title}
      figure={<span className="numbers">{dollars(sheet?.ok ? sheet.value.spendableBase : null)}</span>}
      figureLabel={FUNDING.receipt.figureLabel}
      atMs={atMs}
      txHash={last}
      txLabel={FUNDING.receipt.transfer(txHashes.length, txHashes.length)}
      network={network}
      rows={earlier.map((hash, i) => ({ label: FUNDING.receipt.transfer(i + 1, txHashes.length), value: shortHex(hash), href: txUrl(hash, network) }))}
      footer={FUNDING.receipt.footer}
    />
  );
}
