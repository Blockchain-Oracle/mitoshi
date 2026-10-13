"use client";
// The sheet the Receipt action opens (R4-4, D-227; critic gap 21): `TxReceipt` (the cream stub) with who signed it, the
// fee, and the key's limit when a key spent — in the kit sheet (`?d=receipt`, Back closes it). Mounted once, beside the
// funds host; it renders nothing until a receipt is opened.
import { Masked, SlideOver, SlideOverContent } from "@/components/kit";
import { KeyUsedReceipt, TxReceipt } from "@/components/tx";
import { webEnv } from "@/lib/env";
import { closeDrawer, useOpenDrawerName } from "@/lib/drawer-param";
import { usePrivacy } from "@/lib/privacy";
import { WRITE_RECEIPT } from "./copy";
import { RECEIPT_KEY, receiptTitle, useWriteReceipt } from "./write-receipt";

export function ReceiptHost() {
  const receipt = useWriteReceipt();
  const open = useOpenDrawerName() === RECEIPT_KEY && receipt !== null;
  const hidden = usePrivacy();
  if (!receipt) return null;
  const title = receiptTitle(receipt, hidden);
  return (
    <SlideOver open={open} onOpenChange={(o) => !o && closeDrawer()}>
      <SlideOverContent title={WRITE_RECEIPT.title} description={title}>
        <div className="flex flex-col gap-4">
          <TxReceipt
            title={title}
            figure={<Masked>{receipt.figure}</Masked>}
            figureLabel={receipt.figureLabel}
            atMs={receipt.atMs}
            txHash={receipt.txHash}
            network={webEnv.markets.network}
            txLabel={WRITE_RECEIPT.tx}
            rows={[
              { label: WRITE_RECEIPT.signedBy, value: WRITE_RECEIPT.signer[receipt.signer] ?? receipt.signer },
              { label: WRITE_RECEIPT.fee, value: receipt.sponsored ? WRITE_RECEIPT.sponsored : WRITE_RECEIPT.selfPaid },
            ]}
          />
          {receipt.key ? <KeyUsedReceipt keyLabel={WRITE_RECEIPT.signer[receipt.signer] ?? receipt.signer} leftText={receipt.key.left} limitText={receipt.key.limit} expiresText={receipt.key.expires} /> : null}
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
