/**
 * The default receipt a TxCta morphs into, for a host without its own (R6 T12, D-230): the cream Receipt grammar
 * compacted — accent rule, title, the figure, up to three rows, the explorer row, the perforation — then "Place
 * another" and an optional share slot below the stub, in the page's own theme. The title takes focus after the morph.
 */
import type { Hex, Network } from "@cwf/core";
import { txUrl } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import type { ReactNode } from "react";
import { PillButton } from "@/components/kit/PillButton";
import { ReceiptRow } from "@/components/receipt/ReceiptRow";
import { ReceiptStub } from "@/components/receipt/ReceiptStub";
import { TX } from "./copy";

export interface TxPlacedProps {
  title: string;
  figure: ReactNode;
  figureLabel: string;
  txHash: Hex | null;
  network: Network;
  rows?: readonly { label: string; value: ReactNode }[];
  onAnother?: () => void;
  anotherLabel?: string;
  share?: ReactNode;
}

export function TxPlaced({ title, figure, figureLabel, txHash, network, rows = [], onAnother, anotherLabel = TX.another, share }: TxPlacedProps) {
  return (
    <div className="tx-placed">
      <article className="relative w-full overflow-hidden rounded-(--receipt-radius) bg-cream text-cream-ink shadow-(--receipt-shadow)">
        <div className="h-1.5 bg-accent" aria-hidden="true" />
        <div className="flex flex-col gap-3 p-4">
          <h3 className="type-label-micro text-cream-ink/70">{title}</h3>
          <div className="flex flex-col gap-0.5">
            <span className="type-label-micro text-cream-ink/70">{figureLabel}</span>
            <div className="type-data-lg">{figure}</div>
          </div>
          {rows.length > 0 || txHash ? (
            <div className="flex flex-col gap-2">
              {rows.slice(0, 3).map((r) => (
                <ReceiptRow key={r.label} label={r.label}>{r.value}</ReceiptRow>
              ))}
              {txHash ? <ReceiptRow label={TX.transaction} href={txUrl(txHash, network)}>{shortHex(txHash)}</ReceiptRow> : null}
            </div>
          ) : null}
        </div>
        <ReceiptStub />
        <div className="h-3" aria-hidden />
      </article>
      {onAnother || share ? (
        <div className="tx-placed-actions">
          {onAnother ? <PillButton tone="ghost" size="md" onClick={onAnother}>{anotherLabel}</PillButton> : null}
          {share}
        </div>
      ) : null}
    </div>
  );
}
