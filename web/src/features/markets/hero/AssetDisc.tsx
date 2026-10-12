// Ported from Owarine 90a91d71:web/src/features/markets/hero/asset-mark.tsx (O-1, D-222) — every listed ticker draws
// its issuer's mark on its brand colour, resolved through the registry (`Ticker.brand`); an asset the registry doesn't
// know keeps the initial on a plain disc, never another asset's mark or colour.
import { isTickerSymbol, TICKERS } from "@cwf/core";
import { AssetMarkSvg } from "@/components/icons/asset-marks/AssetMarkSvg";
import { cn } from "@/lib/utils";

/** `NVDA`, `nvda`, the 24/7 lane's `NVDA-24`, the bridged token `bNVDA` (Q-023) → the registry entry, or null. */
function tickerOf(asset: string) {
  const raw = asset.trim().replace(/-24$/, "");
  const symbol = raw.toUpperCase();
  if (isTickerSymbol(symbol)) return TICKERS[symbol];
  const bridged = /^b[A-Z]+$/.test(raw) ? raw.slice(1) : null;
  return bridged && isTickerSymbol(bridged) ? TICKERS[bridged] : null;
}

export function AssetDisc({ asset, className }: { asset: string; className: string }) {
  const ticker = tickerOf(asset);
  if (!ticker) {
    return (
      <span aria-hidden className={cn(className, "generic")}>
        <span>{asset.slice(0, 1).toUpperCase()}</span>
      </span>
    );
  }
  return (
    <span aria-hidden className={cn(className, "has-mark")} data-brand={ticker.brand.slug}>
      <AssetMarkSvg slug={ticker.brand.slug} monogram={ticker.monogram} className="asset-mark" />
    </span>
  );
}
