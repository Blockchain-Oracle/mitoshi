"use client";
// One open call as a share (R4-13a, D-227): the image, the post and the link every "placed" state hands its Share pill
// — the Call card, Range, Moonshot and Parlay. An open call has no result: the post and the card say what it wins IF it
// lands and the Window's real close in UTC (Owarine 90a91d71's call-card honesty rules).
import { formatCadence } from "@cwf/core/copy";
import { formatUtc, secToMs } from "@cwf/core/units";
import { SHARE } from "./copy";
import type { ShareInput } from "./useShareCard";

export interface CallShareArgs {
  /** "BTC UP · 5M". */
  call: string;
  /** "BTC OVER $64,316". */
  band: string;
  stake: string;
  toWin: string;
  expirySec: number;
  intervalSec?: number;
  /** The page the QR and the post open, e.g. `/trade/BTC`. */
  path: string;
  /** The file's name, without the extension. */
  file: string;
}

export function callShareInput({ call, band, stake, toWin, expirySec, intervalSec, path, file }: CallShareArgs): ShareInput {
  const closes = formatUtc(secToMs(expirySec), { withSeconds: false, withDate: true });
  const url = `${window.location.origin}${path}`;
  return {
    image: { kind: "call", call, band, stake, toWin, closes, url },
    fileName: `mitoshi-${file}.png`,
    text: SHARE.callPost(band, intervalSec ? formatCadence(intervalSec) : "", stake, toWin, closes),
    url,
  };
}
