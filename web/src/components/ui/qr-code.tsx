// A QR code as one SVG path from `qrcode-generator` (the share card's dependency), lifted out of
// `features/funding/ReceiveQr.tsx` (R4-4) so `/download` draws its codes on the server (D-230). No hooks: it renders in a
// server component as static markup, and in a client one as before. The quiet zone is two modules; sizes and colours
// are the caller's classes (no px or hex here).
import qrcode from "qrcode-generator";

export function qrPath(value: string): { size: number; d: string } {
  const q = qrcode(0, "M");
  q.addData(value);
  q.make();
  const count = q.getModuleCount();
  let d = "";
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return { size: count + 4, d };
}

export function QrCode({ value, label, className, bgClassName, inkClassName }: { value: string; label: string; className?: string; bgClassName?: string; inkClassName?: string }) {
  const { size, d } = qrPath(value);
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} className={bgClassName} />
      <path d={d} className={inkClassName} />
    </svg>
  );
}
