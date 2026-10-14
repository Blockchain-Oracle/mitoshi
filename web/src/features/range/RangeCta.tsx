"use client";
// A Range, Moonshot or Parlay blocker as the ticket's CTA (R6 games §4.3.5, T06): the kit's BlockedCta wearing the fix
// ("Use $5", "Try BTC 15m →", "Widen the band", "Add money") and doing it, the reason one caption line under it; a
// named wait shimmers in the same slot; with no fix it is the kit's stated block. The price-late block's second way
// out ("Try ETH 5m →", only to a Window whose own price is fresh) is a quiet pill under the caption.
import type { MarketId } from "@cwf/core";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/kit/Pill";
import { BlockedCta } from "@/components/states/BlockedCta";
import { openFunds } from "@/lib/funds-event";
import type { CtaBlocker, RangeBlocker, RangeFix } from "./blockers";
import type { RangePresetKey } from "./presets";

export interface RangeFixHandlers {
  setAmount: (text: string) => void;
  retrySpot: () => void;
  retryQuote: () => void;
  retryFunds: () => void;
  /** The page's Window list; absent in the markets ticket, where "Try X →" has nowhere to go. */
  pickWindow?: (id: MarketId) => void;
  setPreset?: (preset: RangePresetKey) => void;
  setRung?: (multiple: number) => void;
}

function useRun(handlers: RangeFixHandlers) {
  const router = useRouter();
  return (fix: RangeFix | null): (() => void) | null => {
    if (!fix) return null;
    switch (fix.kind) {
      case "href":
        return () => router.push(fix.href);
      case "window":
        return handlers.pickWindow ? () => handlers.pickWindow!(fix.market.marketId) : null;
      case "amount":
        return () => handlers.setAmount(fix.text);
      case "preset":
        return handlers.setPreset ? () => handlers.setPreset!(fix.preset) : null;
      case "rung":
        return handlers.setRung ? () => handlers.setRung!(fix.multiple) : null;
      case "retry-spot":
        return handlers.retrySpot;
      case "retry-quote":
        return handlers.retryQuote;
      case "retry-funds":
        return handlers.retryFunds;
      case "add-money":
        return openFunds;
    }
  };
}

/** Any ticket's blocker drawn by the kit: `run` resolves a fix to its handler, or null where this host can't run it. */
export function FixCta<F>({ blocker, run }: { blocker: CtaBlocker<F>; run: (fix: F | null) => (() => void) | null }) {
  const own = run(blocker.fix);
  const alt = blocker.alt ? run(blocker.alt.fix) : null;
  return (
    <>
      <BlockedCta blocker={{ label: blocker.label, reason: blocker.caption, fix: null, busy: blocker.wait }} fix={own ? { label: blocker.label, run: own } : undefined} />
      {blocker.alt && alt ? (
        <Pill tone="ghost" size="sm" className="self-center" onClick={alt}>
          {blocker.alt.label}
        </Pill>
      ) : null}
    </>
  );
}

export function RangeCta({ blocker, handlers }: { blocker: RangeBlocker; handlers: RangeFixHandlers }) {
  const run = useRun(handlers);
  return <FixCta blocker={blocker} run={run} />;
}
