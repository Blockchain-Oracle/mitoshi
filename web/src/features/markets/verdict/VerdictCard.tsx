"use client";
/**
 * The stamped verdict (Ported from Masayume 68f7a09:web/src/features/markets/verdict/VerdictCard.tsx): 正夢 in vermilion,
 * 逆夢 as a fact, 無効 with its reason — then the claim card and the cream receipt to audit it ("Don't trust it. Click
 * it."). Announced once. R4-13a (D-227): a Share pill under the receipt (Owarine 90a91d71's ShareTradeButton on its
 * VerdictCard) draws the verdict PNG — the WON / LOST / VOID stamp, the close print, who signed it and a QR to the proof.
 */
import type { ClaimableRow, EventMarket, PinnedVerdictView, Resolution, Verdict } from "@cwf/core";
import { OUTCOME_TO_SIDE } from "@cwf/core";
import { formatCadence, verdictAnnouncement, verdictStrings } from "@cwf/core/copy";
import { formatBaseUnits, shortHex } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { useEffect, useRef, useState } from "react";
import { Money } from "@/components/data";
import { Receipt, ReceiptRow } from "@/components/receipt";
import { ConfettiBurst } from "@/components/ui/confetti-burst";
import { webEnv } from "@/lib/env";
import { SHARE } from "@/features/share/copy";
import { SharePill } from "@/features/share/SharePill";
import { HERO, MARKETS, VERDICT_UI } from "../copy";
import { usdText } from "../units";
import { ClaimWinnings } from "./ClaimWinnings";
import { PnlFigure, VerdictLegs, VerdictStamp } from "./VerdictStamp";

/** A win celebrates once per Window per session — the moment it is first seen stamped, never on a revisit. */
function useFirstWin(marketId: string, won: boolean): boolean {
  const [fire, setFire] = useState(false);
  useEffect(() => {
    if (!won) return;
    const key = `cwf.celebrated.${marketId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    setFire(true);
  }, [marketId, won]);
  return fire;
}

function useAnnounceOnce(text: string): string {
  const first = useRef(text);
  const [said, setSaid] = useState("");
  useEffect(() => setSaid(first.current), []);
  return said;
}

export interface VerdictCardProps {
  verdict: Verdict;
  pinned: PinnedVerdictView;
  market: EventMarket;
  resolution: Resolution | null;
  rows: readonly ClaimableRow[] | null;
}

export function VerdictCard({ verdict, pinned, market, resolution, rows }: VerdictCardProps) {
  const strings = verdictStrings(verdict.outcome);
  const celebrate = useFirstWin(market.marketId, verdict.outcome === "win");
  const announced = useAnnounceOnce(verdictAnnouncement(verdict.outcome, `$${formatBaseUnits(verdict.pnlBase < 0n ? -verdict.pnlBase : verdict.pnlBase, verdict.decimals, { minDp: 2, maxDp: 2 })}`));
  const settledAtMs = verdict.settledAtMs ?? resolution?.settledAtMs ?? market.expirySec * 1000;
  const sides = verdict.legs.map((leg) => (OUTCOME_TO_SIDE[leg.outcomeIdx] === "up" ? MARKETS.up : MARKETS.down)).join(" + ");
  const net = webEnv.markets.network;
  const settlementTx = resolution?.settlementTxHash ?? null;
  const source = resolution?.printSource ?? market.printSource;
  return (
    <article aria-label={`${VERDICT_UI.title}: ${strings.line}`} className="flex flex-col gap-5 rounded-(--market-card-radius) border border-(--market-card-border) bg-(--market-card-surface) p-4">
      <span role="status" aria-live="polite" className="sr-only">{announced}</span>
      <header className="verdict-stage flex items-start justify-between gap-4">
        <ConfettiBurst fire={celebrate} />
        <VerdictStamp outcome={verdict.outcome} />
        <PnlFigure verdict={verdict} />
      </header>
      {verdict.outcome === "void" && <p className="type-body text-ink-secondary">{strings.line}</p>}
      <VerdictLegs legs={verdict.legs} decimals={verdict.decimals} />
      <ClaimWinnings verdict={verdict} pinned={pinned} market={market} resolution={resolution} rows={rows} />
      <Receipt title={VERDICT_UI.receiptTitle} figure={<Money value={pinned.paidBase ?? verdict.payoutBase} decimals={verdict.decimals} className="text-cream-ink" />} figureLabel={VERDICT_UI.paidOut} settledAtMs={settledAtMs} stamp={<VerdictStamp outcome={verdict.outcome} size="compact" />}>
        <ReceiptRow label={VERDICT_UI.window}>{`${market.asset} · ${formatCadence(market.intervalSec)} · ${sides}`}</ReceiptRow>
        <ReceiptRow label={VERDICT_UI.openingPrint}>{usdText(resolution?.openingRaw ?? market.openingPriceRaw)}</ReceiptRow>
        <ReceiptRow label={VERDICT_UI.closingPrint}>{usdText(resolution?.closingRaw ?? null)}</ReceiptRow>
        <ReceiptRow label={VERDICT_UI.source}>{source ? (HERO.sources[source] ?? HERO.sourceUnknown) : HERO.sourceUnknown}</ReceiptRow>
        <ReceiptRow label={VERDICT_UI.settlementTx} href={settlementTx ? txUrl(settlementTx, net) : null} degradedLabel={VERDICT_UI.pendingTx}>{settlementTx ? shortHex(settlementTx, 10, 4) : "—"}</ReceiptRow>
        {pinned.txHash && pinned.phase === "paid" ? <ReceiptRow label={VERDICT_UI.payoutTx} href={txUrl(pinned.txHash, net)}>{shortHex(pinned.txHash, 10, 4)}</ReceiptRow> : null}
      </Receipt>
      <div className="flex justify-end">
        <SharePill
          amounts={false}
          input={() => {
            const call = `${market.asset} ${sides} · ${formatCadence(market.intervalSec).toUpperCase()}`;
            const closing = resolution?.closingRaw ?? null;
            const url = `${window.location.origin}/proof/${market.marketId}`;
            return {
              image: { kind: "verdict", call, outcome: verdict.outcome, close: closing === null ? null : `${VERDICT_UI.closingPrint} ${usdText(closing)}`, signed: source ? SHARE.signedBy(HERO.sources[source] ?? HERO.sourceUnknown) : null, url },
              fileName: `mitoshi-${market.asset.toLowerCase()}-${verdict.outcome}.png`,
              text: SHARE.verdictPost(call, verdict.outcome),
              url,
            };
          }}
        />
      </div>
    </article>
  );
}
