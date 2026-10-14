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
 * R6 games §4.4 (T06): a blocker is the kit's BlockedCta wearing its fix (`parlayBlocker` → `FixCta`), never a grey
 * button; "Add a second leg" closes the phone sheet and puts focus on the first free Window's Up.
 */
import { USD_DECIMALS, type ParlayReserveState } from "@cwf/core";
import { oneUnit } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { useRouter } from "next/navigation";
import { WaitingText } from "@/components/states/WaitingText";
import { TxCta, TxFailureCard } from "@/components/tx";
import { TX } from "@/components/tx/copy";
import { SheetFooter } from "@/components/ui/overlay-footer";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { webEnv } from "@/lib/env";
import { openFunds } from "@/lib/funds-event";
import { RANGE } from "../range/copy";
import { FixCta } from "../range/RangeCta";
import { TicketStrip } from "../range/TicketStrip";
import { callShareInput } from "../share/call-share";
import { SharePill } from "../share/SharePill";
import type { ParlayFix } from "./blockers";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { formatProbPct, usd } from "./format";
import { SlipLegs } from "./SlipLegs";
import { useParlayTicket, type ParlayTicket } from "./useParlayTicket";

const ONE = oneUnit(USD_DECIMALS);

/** "Add a second leg": the first Window the slip doesn't hold, its Up in view and focused. */
export function focusFirstUp(): void {
  const up = document.querySelector<HTMLButtonElement>(".pw-row:not(.is-held) .pw-side--up:not(:disabled)");
  up?.scrollIntoView({ block: "center" });
  up?.focus({ preventScroll: true });
}

/** The place control: the order's hold, its blocker, or the write in flight — the same on the bar and in the sheet. */
export function ParlayCta({ t, onAddLeg = focusFirstUp }: { t: ParlayTicket; onAddLeg?: () => void }) {
  const router = useRouter();
  if (t.busy || t.writes.fetchingSpots) return <TxCta state={t.writes.tx} action={t.writes.fetchingSpots ? PARLAY.cta.fetchingSpots : PARLAY.cta.placing} signer="passkey" sponsored onConfirm={() => undefined} />;
  const run = (fix: ParlayFix | null): (() => void) | null => {
    if (!fix) return null;
    switch (fix.kind) {
      case "href":
        return () => router.push(fix.href);
      case "add-leg":
        return onAddLeg;
      case "amount":
        return () => t.slip.setAmountText(fix.text);
      case "swap-leg":
        return () => t.slip.setWindow(fix.key, fix.window);
      case "drop-leg":
        return () => t.slip.remove(fix.key);
      case "retry-quote":
        return t.retryQuote;
      case "retry-funds":
        return t.retryFunds;
      case "add-money":
        return openFunds;
    }
  };
  if (t.blocker) return <FixCta blocker={t.blocker} run={run} />;
  if (!t.quote) return null;
  return (
    <HoldToConfirm className="ts-hold w-full" confirmLabel={t.signedOut ? RANGE.cta.signingIn : PARLAY.cta.placing} onConfirm={t.place}>
      {PARLAY.cta.place(usd(t.quote.stakeBase), usd(t.quote.maxPayoutBase))}
    </HoldToConfirm>
  );
}

function Slip({ t, windows, onAddLeg }: { t: ParlayTicket; windows: readonly LegWindow[]; onAddLeg?: () => void }) {
  const { slip, q, shown, quote, refusal, writes, placed: placedSlip } = t;
  const figures = slip.legs.map((_, i) => ({ priceRaw: shown?.legPricesRaw[i] ?? null, fairRaw: q.fair?.fairRaw[i] ?? null }));
  const outcome = writes.outcome;
  const sub = shown ? `${PARLAY.slip.ifAll(slip.legs.length)} · ${formatProbPct(shown.combinedProbRaw, ONE)}${shown.correlated ? ` · ${PARLAY.slip.rows.correlated}` : ""}` : slip.legs.length < 2 ? PARLAY.slip.needOneMore : q.error ? RANGE.ticket.noFigure : <WaitingText size="inherit" timeoutMs={null}>{RANGE.block.pricing}</WaitingText>;
  return (
    <div className="ps">
      {slip.legs.length === 0 ? <p className="ps-empty">{PARLAY.slip.empty}</p> : <SlipLegs windows={windows} figures={figures} refusal={refusal} />}
      <TicketStrip multiplierMilli={shown?.multiplierMilli ?? null} sub={sub} toWinBase={shown?.maxPayoutBase ?? null} mode={slip.mode} onMode={slip.setMode} amountText={slip.amountText} onAmount={slip.setAmountText} stale={quote === null && shown !== null}>
        <SheetFooter>
          <ParlayCta t={t} onAddLeg={onAddLeg} />
          <p className="ts-micro">{PARLAY.footnote}</p>
        </SheetFooter>
      </TicketStrip>
      {outcome?.status === "confirmed" ? (
        <div role="status" className="ps-receipt">
          <p className="type-body-strong text-ink">{PARLAY.outcome.placed(outcome.parlayId?.toString() ?? "", placedSlip?.legs ?? slip.legs.length, usd(outcome.stakeBase), usd(outcome.payoutBase))}</p>
          <a href={txUrl(outcome.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption text-cream-ink underline">{PARLAY.outcome.viewReceipt}</a>
          <button type="button" className="min-h-touch type-body-strong text-ink underline" onClick={() => { writes.reset(); slip.clear(); }}>{PARLAY.outcome.another}</button>
          {placedSlip ? <SharePill input={() => callShareInput({ call: `PARLAY · ${placedSlip.legs} LEGS`, band: placedSlip.band, stake: usd(outcome.stakeBase), toWin: usd(outcome.payoutBase), expirySec: placedSlip.expirySec, path: "/parlay", file: `parlay-${outcome.parlayId?.toString() ?? "slip"}` })} /> : null}
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
export function ParlaySlipOf({ t, windows, onAddLeg }: { t: ParlayTicket; windows: readonly LegWindow[]; onAddLeg?: () => void }) {
  return <Slip t={t} windows={windows} onAddLeg={onAddLeg} />;
}
