// Ported from Owarine 90a91d71:web/src/components/kit/ShareCharm.tsx (R4-2, D-227) — the P&L share card as DOM, so a
// page can show (or snapshot) what the share image says. Owarine's keychain charm on the sky is, in Mitoshi, the cream
// receipt that features/share/share-png.ts draws to a canvas: tilted, the accent punch, the call in Sora caps, the
// result huge in the receipt's profit or loss ink, quiet entry/exit lines and the 見通し stamp in the corner. Owarine's
// default footnote ("Private on Canton") is not ported: no footnote unless the caller gives one. `forwardRef` lets a
// caller capture the node.
import { forwardRef, type ReactNode } from "react";
import { BRAND } from "@/lib/copy";
import { cn } from "@/lib/utils";

export interface ShareCharmProps {
  /** "BTC UP · 5M" */
  call: ReactNode;
  /** "+$12.40" or "+184%" — the caller decides which to brag with. */
  result: ReactNode;
  win: boolean;
  /** Up to two quiet lines under the result ("Entry $67,120", "Exit $67,410"). */
  lines?: readonly ReactNode[];
  handle?: string;
  footnote?: ReactNode;
  className?: string;
}

export const ShareCharm = forwardRef<HTMLDivElement, ShareCharmProps>(function ShareCharm({ call, result, win, lines, handle, footnote, className }, ref) {
  return (
    <div ref={ref} data-slot="share-charm" data-win={win ? "" : undefined} className={cn("kit-charm", className)}>
      <span aria-hidden className="kit-charm-punch" />
      <p className="kit-charm-call">{call}</p>
      <p className="kit-charm-result">{result}</p>
      {lines && lines.length > 0 ? (
        <div className="kit-charm-lines">
          {lines.slice(0, 2).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      ) : null}
      <div className="kit-charm-foot">
        <div className="kit-charm-meta">
          {handle ? <p className="kit-charm-handle">{handle}</p> : null}
          {footnote ? <p>{footnote}</p> : null}
        </div>
        <span aria-hidden className="kit-charm-stamp">{BRAND.kanji}</span>
      </div>
    </div>
  );
});
