/**
 * Every value move gets a receipt (D-045, D-052): Masayume's cream stub (`components/receipt`, the app's one inverted
 * surface and one shadow) with the explorer link on the chain the move happened on ("Don't trust it. Click it.").
 */
import type { ReactNode } from "react";
import { txUrl, type ExplorerChain, type Hex, type Network } from "@cwf/core";
import { Receipt, ReceiptRow } from "@/components/receipt";
import { shortHex } from "@cwf/core/units";

export interface TxReceiptProps {
  title: string;
  figure: ReactNode;
  figureLabel: string;
  atMs: number;
  txHash: Hex;
  network: Network;
  chain?: ExplorerChain;
  stamp?: ReactNode;
  rows?: readonly { label: string; value: ReactNode; href?: string | null }[];
  footer?: string;
}

export function TxReceipt({ title, figure, figureLabel, atMs, txHash, network, chain = "tempo", stamp, rows = [], footer }: TxReceiptProps) {
  return (
    <Receipt title={title} figure={figure} figureLabel={figureLabel} settledAtMs={atMs} stamp={stamp} footer={footer}>
      {rows.map((r) => (
        <ReceiptRow key={r.label} label={r.label} href={r.href}>
          {r.value}
        </ReceiptRow>
      ))}
      <ReceiptRow label="Transaction" href={txUrl(txHash, network, chain)}>
        {shortHex(txHash)}
      </ReceiptRow>
    </Receipt>
  );
}
