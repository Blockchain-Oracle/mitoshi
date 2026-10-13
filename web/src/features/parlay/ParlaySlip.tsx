"use client";
/**
 * The slip (E.4 composition): the legs (21st 109 + 29940), then the action block and the place control (23527
 * `HoldToConfirm`), on the rail from 1024, in the phone's sheet (its hold in the pinned footer, `SheetFooter`) and in
 * the terminal's Parlay mode. Ported from Masayume 68f7a09:web/src/features/parlay/ParlayTicket.tsx (the multiplier,
 * the solver, the place ladder) with the ux-audit fixes: the CTA names its blocker (D-045), every wait is named, a
 * failure says whether money moved, and a requote asks again at the new figure.
 * R4-5 (D-227, Ported from Owarine 90a91d71:web/src/features/terminal/ParlaySlip.tsx): the totals are the shared
 * TicketStrip — Pays ×N rolling, "If all n land", the stake chips (they set the amount; adding dropped decimals) — and
 * one footnote: "Can't be sold early. Pays when the last leg closes." The figures stay through a requote.
 */
import { USD_DECIMALS, type ParlayReserveState } from "@cwf/core";
import { oneUnit } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { TxCta, TxFailureCard } from "@/components/tx";
import { TX } from "@/components/tx/copy";
import { SheetFooter } from "@/components/ui/overlay-footer";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { webEnv } from "@/lib/env";
import { RANGE } from "../range/copy";
import { TicketStrip } from "../range/TicketStrip";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { formatProbPct, usd } from "./format";
import { SlipLegs } from "./SlipLegs";
import { useParlayTicket, type ParlayTicket } from "./useParlayTicket";

const ONE = oneUnit(USD_DECIMALS);

/** The place control: the order's hold, its blocker, or the write in flight — the same on the bar and in the sheet. */
export function ParlayCta({ t }: { t: ParlayTicket }) {
  if (t.busy || t.writes.fetchingSpots) return <TxCta state={t.writes.tx} action={t.writes.fetchingSpots ? PARLAY.cta.fetchingSpots : PARLAY.cta.placing} signer="passkey" sponsored onConfirm={() => undefined} />;
  if (t.blocker || !t.quote) return <button type="button" disabled aria-disabled className="ts-blocked">{t.blocker ?? PARLAY.cta.pricing}</button>;
  return (
    <HoldToConfirm className="ts-hold w-full" confirmLabel={t.signedOut ? RANGE.cta.signingIn : PARLAY.cta.placing} onConfirm={t.place}>
      {PARLAY.cta.place(usd(t.quote.stakeBase), usd(t.quote.maxPayoutBase))}
    </HoldToConfirm>
  );
}

function Slip({ t, windows }: { t: ParlayTicket; windows: readonly LegWindow[] }) {
  const { slip, q, shown, quote, refusal, writes } = t;
  const figures = slip.legs.map((_, i) => ({ priceRaw: shown?.legPricesRaw[i] ?? null, fairRaw: q.fair?.fairRaw[i] ?? null }));
  const outcome = writes.outcome;
  const sub = shown ? `${PARLAY.slip.ifAll(slip.legs.length)} · ${formatProbPct(shown.combinedProbRaw, ONE)}${shown.correlated ? ` · ${PARLAY.slip.rows.correlated}` : ""}` : slip.legs.length < 2 ? PARLAY.slip.needOneMore : PARLAY.cta.pricing;
  return (
    <div className="ps">
      {slip.legs.length === 0 ? <p className="ps-empty">{PARLAY.slip.empty}</p> : <SlipLegs windows={windows} figures={figures} refusal={refusal} />}
      <TicketStrip multiplierMilli={shown?.multiplierMilli ?? null} sub={sub} toWinBase={shown?.maxPayoutBase ?? null} mode={slip.mode} onMode={slip.setMode} amountText={slip.amountText} onAmount={slip.setAmountText} stale={quote === null && shown !== null}>
        <SheetFooter>
          <ParlayCta t={t} />
          <p className="ts-micro">{PARLAY.footnote}</p>
        </SheetFooter>
      </TicketStrip>
      {outcome?.status === "confirmed" ? (
        <div role="status" className="ps-receipt">
          <p className="type-body-strong text-ink">{PARLAY.outcome.placed(outcome.parlayId?.toString() ?? "", slip.legs.length, usd(outcome.stakeBase), quote ? usd(quote.maxPayoutBase) : "")}</p>
          <a href={txUrl(outcome.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption text-cream-ink underline">{PARLAY.outcome.viewReceipt}</a>
          <button type="button" className="min-h-touch type-body-strong text-ink underline" onClick={() => { writes.reset(); slip.clear(); }}>{PARLAY.outcome.another}</button>
        </div>
      ) : null}
      {outcome?.status === "requote" ? <p role="alert" className="ps-note ps-note--warn">{TX.requote(usd(outcome.stakeBase))}</p> : null}
      {writes.tx.kind === "failed" ? <TxFailureCard state={writes.tx} onRetry={writes.reset} explorerHref={outcome?.status === "failed" && outcome.txHash ? txUrl(outcome.txHash, webEnv.markets.network) : null} /> : null}
    </div>
  );
}

/** The slip with its own ticket state (the rail, the terminal). */
export function ParlaySlip({ reserve, windows }: { reserve: ParlayReserveState; windows: readonly LegWindow[] }) {
  const t = useParlayTicket(reserve, windows);
  return <Slip t={t} windows={windows} />;
}

/** The slip over a ticket state its host already holds (the phone's SlipBar and sheet share one). */
export function ParlaySlipOf({ t, windows }: { t: ParlayTicket; windows: readonly LegWindow[] }) {
  return <Slip t={t} windows={windows} />;
}
