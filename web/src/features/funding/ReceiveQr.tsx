"use client";
// The account's address as a QR code (R4-4, D-227; critic gap 11) — for a wallet to send pathUSD on Tempo to. Drawn by
// the shared `components/ui/qr-code` (one SVG path from `qrcode-generator`, D-230), in the ink colour on the card
// colour, with its quiet zone; sized by `.receive-qr` in vault.css (no px here).
import { QrCode } from "@/components/ui/qr-code";

export function ReceiveQr({ value, label }: { value: string; label: string }) {
  // The React Compiler memoizes this element, so the code is redrawn only when the address changes.
  return <QrCode value={value} label={label} className="receive-qr" bgClassName="receive-qr-bg" inkClassName="receive-qr-ink" />;
}
