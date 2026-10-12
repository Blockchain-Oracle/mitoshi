"use client";

import { isTickerSymbol } from "@cwf/core/market";
import { isOk } from "@cwf/core";
import type { AssetPrice } from "@cwf/core/types";
import { useAssetPrice } from "@cwf/markets/react";
import { useEffect } from "react";
import { useNowMs } from "@/lib/clock";

/**
 * One asset's live feed, reported upward. Renders nothing.
 *
 * A hook cannot be called in a loop, and a deck's asset list is only known once it is dealt — so the
 * subscription becomes a component and the list becomes children. The alternative was to fix the
 * asset count at two and pass `null` for the absent one, which would quietly break the day the venue
 * lists a third.
 *
 * A stale reading is still reported: it is a real number the feed last published, and the card face
 * says how old it is. Dropping it would leave the stage priceless during exactly the outage a player
 * most needs told about.
 */
export function PriceProbe({ asset, onPrice }: { asset: string; onPrice: (price: AssetPrice) => void }) {
  const nowMs = useNowMs();
  const reading = useAssetPrice(isTickerSymbol(asset) ? asset : null, nowMs);

  useEffect(() => {
    if (reading && isOk(reading) && reading.value) onPrice(reading.value);
  }, [reading, onPrice]);

  return null;
}
