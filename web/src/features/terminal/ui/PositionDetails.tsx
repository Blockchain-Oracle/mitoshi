"use client";
// Tradash's Position details (RV-47) as a right-edge drawer (D-190), on Mitoshi's facts: the Window and where the
// position is held, the Line (the opening print) and the entry spot, avg in and what Close pays now (both in cents a
// contract), PnL, the settle time and the Window's proof page; Reduce (25 / 50 / 75 / 100 % through the one-tap Close),
// Add (a centred modal), "Show on the chart" for a Window not on screen, and Share (RV-83: the S5 share card in a
// centred modal, loaded on the tap).
import { formatCadence } from "@cwf/core/copy";
import { isOk } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { useMarket, useOpeningPrice } from "@cwf/markets/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { SHELL } from "@/lib/copy";
import { tapFeedback } from "@/lib/feedback";
import { usePrivacy } from "@/lib/privacy";
import { formatPrice, priceDecimals } from "../chart/engine";
import { TERMINAL } from "../copy";
import { centsOf, clockText, livePnlText, money, sideWord } from "../format";
import type { TerminalPosition } from "../terminal-positions";
import type { PositionValue } from "../usePositionValue";
import { AddModal } from "./AddModal";
import { PositionGone } from "./PositionGone";

const REDUCE = [25n, 50n, 75n, 100n] as const;
const ShareModal = dynamic(() => import("@/features/share/ShareModal").then((m) => m.ShareModal), { ssr: false });
type ShareSubject = import("@/features/share/ShareModal").ShareSubject;

export function PositionDetails({ p, value, open, onOpenChange, onReduce, onShow, onExits, spendableBase, busy }: {
  p: TerminalPosition | null;
  value: PositionValue | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onReduce: (p: TerminalPosition, sellRaw: bigint) => void;
  onShow: (p: TerminalPosition) => void;
  onExits: (p: TerminalPosition) => void;
  spendableBase: bigint | null;
  busy: boolean;
}) {
  const [adding, setAdding] = useState(false);
  // The share card's subject, frozen when Share is tapped (null: the modal is closed).
  const [sharing, setSharing] = useState<ShareSubject | null>(null);
  const masked = usePrivacy();
  const marketReading = useMarket(open && p ? p.marketId : null);
  const market = marketReading && isOk(marketReading) ? marketReading.value : null;
  const opening = useOpeningPrice(open && p ? p.marketId : null);
  const lineE8 = opening && isOk(opening) ? opening.value : null;
  if (!p) {
    // The position closed (a keeper sale, a settle, a Reduce to zero) while this was open.
    return (
      <>
        <SlideOver open={open} onOpenChange={onOpenChange}>
          <SlideOverContent title={TERMINAL.gone.title}><PositionGone onDone={() => onOpenChange(false)} /></SlideOverContent>
        </SlideOver>
        <AddModal p={null} open={adding} onOpenChange={setAdding} spendableBase={spendableBase} />
      </>
    );
  }
  const hide = (text: string) => (masked ? SHELL.masked : text);
  // Cents a contract: cost ÷ contracts and the exit's proceeds ÷ its contracts, both on six decimals.
  const perContract = (base: bigint, contracts: bigint) => (contracts > 0n ? centsOf(Number((base * 1_000n) / contracts)) : "—");
  const rows: Array<[string, string]> = [
    [TERMINAL.details.window, market ? `${formatCadence(market.intervalSec)} · ${market.lane === "stock24" ? "24/7" : market.lane === "gap" ? "Gap" : market.lane === "crypto24" ? "Crypto" : "Regular"}` : formatCadence(p.intervalSec)],
    [TERMINAL.details.via, p.via === "vault" ? TERMINAL.details.balance : p.via === "boost" ? TERMINAL.details.boost : TERMINAL.details.wallet],
    [TERMINAL.details.line, lineE8 === null ? TERMINAL.details.notYet : `$${formatPrice(Number(lineE8) / 1e8, priceDecimals(Number(lineE8) / 1e8))}`],
    [TERMINAL.details.entry, p.entrySpot ? `$${formatPrice(p.entrySpot, priceDecimals(p.entrySpot))}` : "—"],
    [TERMINAL.details.staked, hide(`${money(p.costBase)} · ${formatBaseUnits(p.heldRaw, p.decimals, { minDp: 0, maxDp: 2 })}`)],
    [TERMINAL.details.avgIn, perContract(p.costBase, p.heldRaw)],
    [TERMINAL.details.now, value?.exit ? hide(`${value.approx ? "≈ " : ""}${money(value.valueBase ?? 0n)} · ${perContract(value.exit.proceedsBase, value.exit.contractsRaw)}`) : value?.locked ? TERMINAL.buttons.locked(clockText(p.expirySec)) : "—"],
    [TERMINAL.details.pnl, value?.pnlBase != null ? hide(livePnlText(value.pnlBase)) : "—"],
    [TERMINAL.details.settles, clockText(p.expirySec)],
  ];
  return (
    <>
      <SlideOver open={open} onOpenChange={onOpenChange}>
        <SlideOverContent title={TERMINAL.details.title(sideWord(p.side), p.asset)}>
          <dl className="tm-details">
            {rows.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <div className="tm-field">
            <span className="tm-field-head">{TERMINAL.details.reduce}</span>
            <div className="tm-choices">
              {/* A Boost sells whole (`LeverageReserve.close`): Close only. */}
              {(p.boost ? [100n] : REDUCE).map((pct) => (
                <button key={String(pct)} type="button" className="tm-choice" disabled={busy || value?.locked} onClick={() => (tapFeedback(), onReduce(p, (p.heldRaw * pct) / 100n))}>
                  {pct === 100n ? TERMINAL.buttons.close : `${pct}%`}
                </button>
              ))}
            </div>
          </div>
          <div className="tm-choices">
            {p.boost ? null : <button type="button" className="tm-choice" disabled={value?.locked} onClick={() => (tapFeedback(), setAdding(true))}>{TERMINAL.details.add}</button>}
            <button type="button" className="tm-choice" disabled={value?.locked} onClick={() => (tapFeedback(), onExits(p))}>{TERMINAL.exits.open}</button>
            <button type="button" className="tm-choice" onClick={() => (tapFeedback(), onShow(p))}>{TERMINAL.details.chart}</button>
            <Link href={`/proof/${p.marketId}`} className="tm-choice tm-link">{TERMINAL.details.proof}</Link>
            <button
              type="button"
              className="tm-choice"
              disabled={masked || value?.pnlBase == null}
              onClick={() => {
                tapFeedback();
                setSharing({
                  asset: p.asset, side: p.side, intervalSec: p.intervalSec, pnlBase: value?.pnlBase ?? 0n, costBase: p.costBase, decimals: p.decimals, closed: false,
                  entry: p.entrySpot ? `$${formatPrice(p.entrySpot, priceDecimals(p.entrySpot))}` : null,
                  exit: value?.spot ? `$${formatPrice(value.spot, priceDecimals(value.spot))}` : null,
                });
              }}
            >
              {TERMINAL.details.share}
            </button>
          </div>
        </SlideOverContent>
      </SlideOver>
      <AddModal p={p} open={adding} onOpenChange={setAdding} spendableBase={spendableBase} />
      {sharing ? <ShareModal open onOpenChange={(o) => !o && setSharing(null)} subject={sharing} /> : null}
    </>
  );
}
