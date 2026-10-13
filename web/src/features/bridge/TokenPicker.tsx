"use client";
// The stock picker (R4-12, D-227): the five bridged tickers with this wallet's balance on the source chain, in the
// app's one drawer (`components/ui/drawer.tsx` — a right slide-over from 768 px, Owarine's bottom sheet below). From
// 21st.dev 16251's `TokenPicker`, revamped onto that drawer instead of its own absolute overlay.
import { BRIDGE_TICKERS, type BridgeTicker } from "@cwf/core";
import { Check } from "lucide-react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { BRIDGE } from "./copy";

export function TokenPicker({ open, onOpenChange, selected, prefix, balances, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; selected: BridgeTicker; prefix: string; balances: Partial<Record<BridgeTicker, string>>; onPick: (t: BridgeTicker) => void }) {
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={BRIDGE.pickTitle} description={BRIDGE.pickNote}>
        <ul className="brc-pick">
          {BRIDGE_TICKERS.map((t) => (
            <li key={t}>
              <button
                type="button"
                className="brc-pick-row"
                aria-pressed={t === selected}
                onClick={() => {
                  onPick(t);
                  onOpenChange(false);
                }}
              >
                <AssetDisc asset={t} className="brc-pick-disc" />
                <span className="brc-pick-sym">{prefix}{t}</span>
                <span className="numbers brc-pick-bal">{balances[t] ?? "—"}</span>
                {t === selected ? <Check aria-hidden className="size-4 text-accent" /> : <span aria-hidden className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      </SlideOverContent>
    </SlideOver>
  );
}
