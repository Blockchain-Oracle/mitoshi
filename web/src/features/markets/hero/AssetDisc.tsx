// Ported from Masayume 68f7a09:web/src/features/markets/hero/asset-mark.tsx — the vector mark for an asset the reference
// drew (BTC, ETH), the ticker's initial on the disc otherwise; never another asset's mark or colour.
import type { ComponentType } from "react";
import { BitcoinMark, EthereumMark } from "@/components/icons/AssetMarks";
import { cn } from "@/lib/utils";

const MARKS: Record<string, ComponentType<{ className?: string }>> = { BTC: BitcoinMark, ETH: EthereumMark };

export function AssetDisc({ asset, className }: { asset: string; className: string }) {
  const Mark = MARKS[asset.toUpperCase()] ?? null;
  return (
    <span aria-hidden className={cn(className, Mark ? "has-mark" : "generic")}>
      {Mark ? <Mark className="asset-mark" /> : <span>{asset.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}
