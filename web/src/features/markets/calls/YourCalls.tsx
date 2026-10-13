"use client";
/**
 * "Your calls" — the user's own positions pinned on /markets (D-048): each call walks to its own verdict and payout
 * here while the hero moves on to the next Window. R4-3 (D-227): one sideways row of compact chips (asset · side · line ·
 * the countdown or the verdict) on the kit's ScrollRail (From 21st.dev 10484 moumensoliman/scroll-fade-effect, R4-2), so
 * §01 starts right under the hero; a chip opens the full card — the Call, then the stamp and its receipt — in a sheet.
 * Owarine has no /markets equivalent. Renders nothing signed out or with no calls from this device.
 */
import type { Address } from "@cwf/core";
import { isOk } from "@cwf/core";
import { useOpeningPrice } from "@cwf/markets/react";
import { useState } from "react";
import { Countdown } from "@/components/data";
import { ScrollRail } from "@/components/kit/ScrollRail";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { useNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { useWalletSession } from "@/lib/wallet-session";
import { CALLS_SECTION, CALLS_CHIP, MARKETS } from "../copy";
import { dismissCall, type PlacedCall } from "../data/calls-store";
import { useCalls } from "../data/useCalls";
import { AssetDisc } from "../hero/AssetDisc";
import { usdLine } from "../units";
import { PinnedCall } from "./PinnedCall";
import { usePinned } from "./usePinned";
import "@/components/kit/kit.css";

const keyOf = (call: PlacedCall) => `${call.marketId}:${call.side}`;

function CallChip({ wallet, call, onOpen }: { wallet: Address; call: PlacedCall; onOpen: () => void }) {
  const nowMs = useNowMs();
  const pinned = usePinned(wallet, call.marketId, call.expirySec, nowMs);
  const view = pinned && isOk(pinned) ? pinned.value : undefined;
  const opening = useOpeningPrice(call.marketId);
  const lineRaw = opening?.ok ? opening.value : null;
  const outcome = view?.verdict?.outcome ?? null;
  const state = outcome ? CALLS_CHIP[outcome] : view?.phase === "settling" || (nowMs > 0 && nowMs >= call.expirySec * 1000) ? CALLS_CHIP.settling : null;
  return (
    <button type="button" className="call-chip" data-side={call.side} data-outcome={outcome ?? undefined} onClick={onOpen} aria-label={CALLS_CHIP.open(call.asset, call.side === "up" ? MARKETS.up : MARKETS.down)}>
      <AssetDisc asset={call.asset} className="glyph" />
      <span className="call-chip-asset">{call.asset}</span>
      <span className={cn("call-chip-side", call.side)}>{call.side === "up" ? MARKETS.up : MARKETS.down}</span>
      {lineRaw !== null ? <span className="call-chip-line">{usdLine(lineRaw)}</span> : null}
      <span className="call-chip-state">{state ?? <Countdown expirySec={call.expirySec} intervalSec={call.expirySec - call.tradingStartSec} />}</span>
    </button>
  );
}

export function YourCalls() {
  const { address } = useWalletSession();
  const calls = useCalls(address);
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!address || calls.length === 0) return null;
  const open = calls.find((c) => keyOf(c) === openKey) ?? null;
  return (
    <section className="markets-calls" aria-label={CALLS_SECTION.title}>
      <ScrollRail label={CALLS_SECTION.title}>
        {calls.map((call) => (
          <CallChip key={keyOf(call)} wallet={address} call={call} onOpen={() => setOpenKey(keyOf(call))} />
        ))}
      </ScrollRail>
      <SlideOver open={open !== null} onOpenChange={(next) => !next && setOpenKey(null)} urlKey="call">
        <SlideOverContent title={open ? `${CALLS_SECTION.title} · ${open.asset}` : CALLS_SECTION.title}>
          {open ? (
            <PinnedCall
              wallet={address}
              call={open}
              onDismiss={() => {
                dismissCall(address, open.marketId);
                setOpenKey(null);
              }}
            />
          ) : null}
        </SlideOverContent>
      </SlideOver>
    </section>
  );
}
