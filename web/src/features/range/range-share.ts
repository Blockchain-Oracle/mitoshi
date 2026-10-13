"use client";
// A placed Range or Moonshot round as a share (R4-13a, D-227; the role of Owarine 90a91d71's call-card on its placed
// state): the terms the round was booked on — its band, the stake, what it pays if the price finishes inside, the
// Window's close — read from the confirmed open, never from the live quote the ticket has moved on to since.
import type { EventMarket } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { callShareInput } from "../share/call-share";
import type { ShareInput } from "../share/useShareCard";
import { usd } from "../parlay/format";
import type { RangeOpenOutcome } from "./useRangeWrites";

export type PlacedRange = Extract<RangeOpenOutcome, { status: "confirmed" }>;

export function rangeShare(placed: PlacedRange, market: EventMarket, game: "range" | "moonshot", path: string): ShareInput {
  const cadence = formatCadence(market.intervalSec).toUpperCase();
  return callShareInput({
    call: game === "range" ? `${market.asset} RANGE · ${cadence}` : `${market.asset} MOONSHOT`,
    band: `${market.asset} ${placed.bandText}`,
    stake: usd(placed.stakeBase),
    toWin: usd(placed.payoutBase),
    expirySec: placed.expirySec ?? market.expirySec,
    intervalSec: market.intervalSec,
    path,
    file: `${game}-${market.asset.toLowerCase()}${placed.roundId !== null ? `-${placed.roundId}` : ""}`,
  });
}
