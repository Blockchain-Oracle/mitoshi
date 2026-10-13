"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/history/HistoryReceipt.tsx (R4-4, D-227) — one open receipt at a
// time, in the kit sheet: the verdict the live Window stamps (Mitoshi's VerdictStamp, P&L figure and legs, from core's
// `toVerdict(round)`), then the cream receipt — the Window, both prints and the settlement transaction as the chain has
// them (`useMarket`, `useResolution`), what went in and came out — and the proof page. A settled row and the moment it
// settled can't disagree: they read one round.
import { OUTCOME_TO_SIDE, isOk, roundSettledAtMs, toVerdict, type SettledRound } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { shortHex } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { useMarket, useResolution } from "@cwf/markets/react";
import Link from "next/link";
import { Masked } from "@/components/kit/Masked";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { Receipt, ReceiptRow } from "@/components/receipt";
import { money } from "@/features/terminal/format";
import { webEnv } from "@/lib/env";
import { HERO, HISTORY, MARKETS, VERDICT_UI } from "../copy";
import { usdText } from "../units";
import { PnlFigure, VerdictLegs, VerdictStamp } from "../verdict/VerdictStamp";
import "@/components/kit/kit.css";

function ReceiptBody({ round }: { round: SettledRound }) {
  const market = useMarket(round.marketId);
  const resolution = useResolution(round.marketId);
  const m = market && isOk(market) ? market.value : null;
  const r = resolution && isOk(resolution) ? resolution.value : null;
  const verdict = toVerdict(round);
  const net = webEnv.markets.network;
  const sides = [...new Set(round.legs.length > 0 ? round.legs.map((l) => l.outcomeIdx) : round.sidesTraded)].map((o) => (OUTCOME_TO_SIDE[o] === "up" ? MARKETS.up : MARKETS.down)).join(" + ");
  const source = r?.printSource ?? m?.printSource ?? null;
  const settlementTx = r?.settlementTxHash ?? null;
  const usd = (base: bigint) => <Masked>{money(base, false, round.decimals)}</Masked>;
  return (
    <div className="flex flex-col gap-5">
      <header className="verdict-stage flex items-start justify-between gap-4">
        <VerdictStamp outcome={verdict.outcome} />
        <PnlFigure verdict={verdict} />
      </header>
      {round.legs.length > 0 ? <VerdictLegs legs={round.legs} decimals={round.decimals} /> : null}
      <Receipt title={round.outcome === "closed" ? HISTORY.closedTitle : HISTORY.receiptTitle} figure={usd(round.payoutBase + round.proceedsBase)} figureLabel={VERDICT_UI.paidOut} settledAtMs={roundSettledAtMs(round)} stamp={<VerdictStamp outcome={verdict.outcome} size="compact" />}>
        <ReceiptRow label={VERDICT_UI.window}>{`${round.asset} · ${formatCadence(round.intervalSec)} · ${sides}`}</ReceiptRow>
        <ReceiptRow label={HISTORY.stake}>{usd(round.stakeBase)}</ReceiptRow>
        {round.proceedsBase > 0n ? <ReceiptRow label={HISTORY.sold}>{usd(round.proceedsBase)}</ReceiptRow> : null}
        <ReceiptRow label={VERDICT_UI.openingPrint}>{usdText(r?.openingRaw ?? m?.openingPriceRaw ?? null)}</ReceiptRow>
        <ReceiptRow label={VERDICT_UI.closingPrint}>{usdText(r?.closingRaw ?? null)}</ReceiptRow>
        <ReceiptRow label={VERDICT_UI.source}>{source ? (HERO.sources[source] ?? HERO.sourceUnknown) : HERO.sourceUnknown}</ReceiptRow>
        <ReceiptRow label={VERDICT_UI.settlementTx} href={settlementTx ? txUrl(settlementTx, net) : null} degradedLabel={VERDICT_UI.pendingTx}>{settlementTx ? shortHex(settlementTx, 10, 4) : "—"}</ReceiptRow>
        {round.source === "wallet" ? <ReceiptRow label={HISTORY.entryTx} href={txUrl(round.entryTxHash, net)}>{shortHex(round.entryTxHash, 10, 4)}</ReceiptRow> : null}
      </Receipt>
      <Link href={`/proof/${round.marketId}`} className="inline-flex min-h-touch items-center self-start type-body-strong text-accent">{HISTORY.proof}</Link>
    </div>
  );
}

/** `round` is the last one opened: it stays in the sheet while `open` animates it closed. */
export function HistoryReceipt({ round, open, onClose }: { round: SettledRound | null; open: boolean; onClose: () => void }) {
  return (
    <SlideOver open={open && round !== null} onOpenChange={(o) => !o && onClose()}>
      <SlideOverContent title={round?.outcome === "closed" ? HISTORY.closedTitle : HISTORY.receiptTitle} description={round ? `${round.asset} · ${HISTORY.outcome[round.outcome] ?? round.outcome}` : undefined}>
        {round ? <ReceiptBody key={`${round.source}:${round.marketId}:${round.openedAtMs}`} round={round} /> : null}
      </SlideOverContent>
    </SlideOver>
  );
}
