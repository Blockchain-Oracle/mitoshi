"use client";
// The account's address as a QR code (R4-4, D-227; critic gap 11) — for a wallet to send pathUSD on Tempo to. Drawn as
// one SVG path from `qrcode-generator` (already the share card's dependency), in the ink colour on the card colour, with
// its quiet zone; sized by `.receive-qr` in vault.css (no px here).
import qrcode from "qrcode-generator";
import { useMemo } from "react";

export function ReceiveQr({ value, label }: { value: string; label: string }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(value);
    q.make();
    const count = q.getModuleCount();
    let path = "";
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) path += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { n: count + 4, d: path };
  }, [value]);
  return (
    <svg className="receive-qr" viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} className="receive-qr-bg" />
      <path d={d} className="receive-qr-ink" />
    </svg>
  );
}
