"use client";
// A settled Window's Share pill in the portfolio's History (R4-13a, D-227; critic gap 6: Owarine 90a91d71's
// ShareTradeButton on its history receipt). A round the Window settled shares as its verdict: the WON / LOST / VOID
// stamp, the Window's signed close and who signed it — read from the chain at the tap, within a beat, else left off —
// and a QR to /proof/<market>. A round cashed out before the close has no verdict of its own: it shares as the
// position card with its P&L, so amounts follow privacy mode.
import type { MarketId, MarketsProvider, SettledRound } from "@cwf/core";
import { OUTCOME_TO_SIDE } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { formatBaseUnits } from "@cwf/core/units";
import { useMarketsPort } from "@cwf/markets/react";
import { SHARE } from "@/features/share/copy";
import { SharePill } from "@/features/share/SharePill";
import type { ShareImage } from "@/features/share/share-cards";
import type { ShareInput } from "@/features/share/useShareCard";
import { HERO, VERDICT_UI } from "../copy";
import { SIDE_WORD } from "../side-styles";
import { usdText } from "../units";

/** How long the tap waits on the Window's signed close before the card goes without it. */
const CLOSE_READ_MS = 1_500;

async function signedClose(port: MarketsProvider | null, marketId: MarketId): Promise<{ close: string | null; signed: string | null }> {
  if (!port) return { close: null, signed: null };
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CLOSE_READ_MS));
  const r = await Promise.race([port.getResolution(marketId).catch(() => null), timeout]);
  const res = r?.ok ? r.value : null;
  return {
    close: res?.closingRaw != null ? `${VERDICT_UI.closingPrint} ${usdText(res.closingRaw)}` : null,
    signed: res?.printSource ? SHARE.signedBy(HERO.sources[res.printSource] ?? HERO.sourceUnknown) : null,
  };
}

const dollars = (b: bigint, d: number) => `${b < 0n ? "−" : "+"}$${formatBaseUnits(b < 0n ? -b : b, d, { minDp: 2, maxDp: 2 })}`;

function inputOf(r: SettledRound, port: MarketsProvider | null): ShareInput {
  const sides = r.sidesTraded.map((o) => SIDE_WORD[OUTCOME_TO_SIDE[o]]).join(" + ");
  const call = `${r.asset} ${sides} · ${formatCadence(r.intervalSec).toUpperCase()}`;
  const url = `${window.location.origin}/proof/${r.marketId}`;
  if (r.outcome === "closed") {
    const roi = r.stakeBase > 0n ? (Number(r.pnlBase) / Number(r.stakeBase)) * 100 : 0;
    const pnl = dollars(r.pnlBase, r.decimals);
    const win = r.pnlBase >= 0n;
    const image: ShareImage = { kind: "position", call, result: `${pnl} · ${roi >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}%`, win, entry: null, exit: null, exitLabel: "Exit", url };
    return { image, fileName: `mitoshi-${r.asset.toLowerCase()}-closed.png`, text: SHARE.post(r.asset, OUTCOME_TO_SIDE[r.sidesTraded[0] ?? 0], pnl, roi, win), url };
  }
  const outcome = r.outcome;
  return {
    image: async () => ({ kind: "verdict", call, outcome, ...(await signedClose(port, r.marketId)), url }),
    fileName: `mitoshi-${r.asset.toLowerCase()}-${outcome}.png`,
    text: SHARE.verdictPost(call, outcome),
    url,
  };
}

export function HistoryShare({ round }: { round: SettledRound }) {
  const port = useMarketsPort();
  return <SharePill className="journal-share" amounts={round.outcome === "closed"} input={() => inputOf(round, port)} />;
}
