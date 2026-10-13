"use client";
// The route in one line (R4-12, D-227; Owarine 90a91d71 `MoneySheet.tsx`'s receipt grammar, shortened): the source
// fee, "via Base", and a time only when bridge-watch has measured one (the median of delivered transfers) — never a
// promise. The capacity chip opens today's room (21st 36185) in a popover.
import { Popover } from "@base-ui/react/popover";
import { RateLimitMeter } from "@/components/ui/rate-limit-meter";
import { sd, span } from "./format";
import { BRIDGE } from "./copy";

export function RouteLine({ fee, via, etaSec, capacity }: { fee: string | null; via: boolean; etaSec: number | null; capacity: { availableSD: bigint; capacitySD: bigint } | null }) {
  const parts = [fee, via ? BRIDGE.via : null, etaSec !== null ? BRIDGE.eta(span(etaSec)) : null].filter(Boolean);
  return (
    <div className="brc-route">
      <span className="numbers brc-route-text">{parts.join(" · ")}</span>
      {capacity ? (
        <Popover.Root>
          <Popover.Trigger className="brc-cap">{BRIDGE.capacity(sd(capacity.availableSD, 0))}</Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={8} align="end" className="brc-cap-pos">
              <Popover.Popup className="brc-cap-pop">
                <RateLimitMeter label={BRIDGE.capacityTitle} remaining={Number(capacity.availableSD)} limit={Number(capacity.capacitySD)} remainingText={sd(capacity.availableSD, 0)} limitText={sd(capacity.capacitySD, 0)} windowText={BRIDGE.capacityWindow} />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </div>
  );
}
