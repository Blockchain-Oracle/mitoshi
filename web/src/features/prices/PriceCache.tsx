"use client";
// App pages: every price tick from the shared stream goes into the query cache (`keys.price(symbol)`) once per frame,
// so any surface reads a live price with `usePrice(symbol)` (D-049). A lazy island: it costs the first load nothing.
import { usePriceStream } from "@cwf/markets/react";
import { ensureStream } from "./stream-config";

export default function PriceCache() {
  usePriceStream(ensureStream());
  return null;
}
