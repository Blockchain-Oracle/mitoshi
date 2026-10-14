"use client";
/**
 * The Moonshot ticket (Ported from Masayume 68f7a09:web/src/features/games/moonshot/{MoonshotBuilder,MoonshotTicket,
 * AimControl,useMoonshotQuote}.tsx): call a direction and a reach (×2…×25) on a Window; the house solves the level from
 * the chain's basis and the contract prices the saturated band (`quoteMoonshotOnchain`), so the level, the odds and
 * the multiple are the contract's own. It opens through the range lane with a signed spot (D-172).
 * R4-5 (D-227, Ported from Owarine 90a91d71:web/src/features/games/moonshot/{MoonshotBuilder,useExpiryCapacity}.ts):
 * the AimPad, a distance gauge (opening print → the level, the live price travelling between), then the shared
 * TicketStrip — Pays ×N over "long · above $X · +0.42%", Stake or Payout (the rung's cap, one tap to set it) — and the
 * hold. The reserve's caps are read before the popup ("Won't fit this expiry"), every refusal is named by the Range
 * mapping, the last quote stays on screen through a requote, and signed out the hold opens sign-in for the order.
 * R4-5 review (D-227): the book's drift from the live price is tested as Range's is (the open's 2σ bound), and the cap
 * is set in base units (a rounded float could land a cent over it).
 * R6 games §4.3.4–§4.3.5 (T17, T06): Range's `rangeBlocker` names every block as its fix (a long shot is "Try ×5", the
 * rung's cap "Use $50 payout"), the price and quote waits are named then honest when late, and "Try X →" moves along
 * the page's Windows.
 */
import { USD_DECIMALS, type EventMarket } from "@cwf/core";
import { MOONSHOT_RUNGS, moonshotPayoutCapBase, RANGE_STAKE_HEADROOM_BPS, type MoonshotRung, type RangeReserveState } from "@cwf/core/range";
import { REQUOTE_MS } from "@cwf/core/constants";
import { formatBaseUnits, mulBpsCeil, oneUnit, parseDecimalToBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { quoteMoonshotOnchain, readRangeCapacity, type MoonshotQuote, type RangeModel } from "@cwf/markets/range";
import { keys, useBalanceSheet, useReadingQuery } from "@cwf/markets/react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { WaitingText } from "@/components/states/WaitingText";
import { useState } from "react";
import { TxCta, TxFailureCard } from "@/components/tx";
import { TX } from "@/components/tx/copy";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { useNowMs } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { useFirstFunding } from "@/features/funding/first-fund-state";
import { useDebounced } from "../../markets/ticket/useDebounced";
import { usd } from "../../parlay/format";
import { fitAmountBase, rangeBlocker } from "../../range/blockers";
import { RangeCta } from "../../range/RangeCta";
import type { TicketAlts } from "../../range/RangeTicketBody";
import { useFreshness } from "../../range/useFreshness";
import { useLate } from "../../range/useLate";
import { RANGE } from "../../range/copy";
import { rangeKeys } from "../../range/data";
import { usdBand } from "../../range/format";
import { TicketStrip, type SolveMode } from "../../range/TicketStrip";
import { useRangeDrift } from "../../range/useRangeQuote";
import { useRangeSpot } from "../../range/useRangeSpot";
import { useRangeWrites } from "../../range/useRangeWrites";
import { AimPad, useRememberedCall } from "./AimPad";
import { rangeShare } from "../../range/range-share";
import { SharePill } from "../../share/SharePill";
import { MOONSHOT } from "./copy";

const ONE = oneUnit(USD_DECIMALS);
const QUOTE_LATE_MS = 15_000;
const FUNDING_LATE_MS = 30_000;
const pctOf = (from: bigint, to: bigint) => (from > 0n ? (Number(to - from) * 100) / Number(from) : 0);
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

/** Opening print → the level, the live price as a dot between them and the way travelled filled (Owarine `.rg-track`, one edge). */
function DistanceGauge({ opening, strike, spot }: { opening: bigint; strike: bigint; spot: bigint | null }) {
  const lo = opening < strike ? opening : strike;
  const span = Number((opening < strike ? strike : opening) - lo) || 1;
  const pct = (v: bigint) => Math.max(0, Math.min(100, (Number(v - lo) / span) * 100));
  const at = (v: bigint) => `${pct(v)}%`;
  // The fill is the way travelled: from the opening print to the live price, toward the level.
  const from = pct(opening);
  const to = spot === null ? from : pct(spot);
  const needs = pctOf(opening, strike);
  const now = spot === null ? null : pctOf(opening, spot);
  return (
    <div className="ms-gauge" role="img" aria-label={MOONSHOT.gauge.label(signedPct(needs), now === null ? "" : signedPct(now))}>
      <div className="ms-track">
        <span className="ms-track-line" />
        <span className="ms-track-fill" style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%` }} />
        <span className="ms-track-end" style={{ left: at(opening) }} />
        <span className="ms-track-end is-target" style={{ left: at(strike) }} />
        {spot !== null ? <span className="ms-track-dot" style={{ left: at(spot) }} /> : null}
      </div>
      <div className="ms-gauge-foot numbers">
        <span>{MOONSHOT.gauge.opened(usdBand(opening))}</span>
        <span>{MOONSHOT.gauge.needs(signedPct(needs), now === null ? null : signedPct(now))}</span>
      </div>
    </div>
  );
}

export function MoonshotTicket({ market, model, reserve, alts }: { market: EventMarket; model: RangeModel | null; reserve: RangeReserveState; alts?: TicketAlts }) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const queryClient = useQueryClient();
  const sheet = useBalanceSheet(session.address);
  const writes = useRangeWrites(session.address);
  // The live price (stream, else the signed median) — the gauge's dot and the drift test the open makes (R4-5 review).
  const spot = useRangeSpot(market, model?.feed ?? null, nowMs);
  const spotE8 = spot.spotE8;
  const spotCents = spotE8 === null ? null : spotE8 / 1_000_000n;
  const driftE4 = useRangeDrift(market.marketId, market.asset, spotE8, model !== null && !reserve.paused);
  const [call, setCall] = useRememberedCall();
  const [mode, setMode] = useState<SolveMode>("fixStake");
  const [amountText, setAmountText] = useState("5");
  const amountBase = parseDecimalToBaseUnits(amountText || "0", USD_DECIMALS) ?? 0n;
  const capBase = moonshotPayoutCapBase(call.multiple, reserve.params.maxPayoutCapBase, ONE);
  const overCap = mode === "fixPayout" && amountBase > capBase;
  const signature = `moonshot:${market.marketId}:${call.direction}:${call.multiple}:${mode}:${amountBase}`;
  const debounced = useDebounced(signature, 400);
  const active = model !== null && !reserve.paused && amountBase > 0n && !overCap && debounced === signature;
  const reading = useReadingQuery(
    rangeKeys.quote(debounced),
    () => quoteMoonshotOnchain({ marketId: market.marketId, asset: market.asset }, call, mode === "fixStake" ? { kind: "fixStake", stakeBase: amountBase } : { kind: "fixPayout", maxPayoutBase: amountBase }, reserve.params, Math.max(1, market.expirySec - Math.floor(Date.now() / 1000))),
    { enabled: active, pollMs: REQUOTE_MS },
  );
  const q = active && reading?.ok ? reading.value : null;
  const error = active && reading && !reading.ok ? reading.error : null;
  const [last, setLast] = useState<MoonshotQuote | null>(null);
  if (q && q !== last) setLast(q);
  const shown = error ? null : (q ?? (last && last.call.direction === call.direction && last.call.multiple === call.multiple ? last : null));
  const capacity = useQuery({
    queryKey: [...rangeKeys.all, "capacity", "moonshot", q ? q.houseLockedBase.toString() : "", market.expirySec],
    queryFn: async () => {
      const r = await readRangeCapacity(q!.houseLockedBase, market.expirySec);
      return r.ok ? r.value : null;
    },
    enabled: q !== null,
    staleTime: REQUOTE_MS,
    placeholderData: keepPreviousData,
  });
  const spendable = sheet?.ok ? sheet.value.spendableBase : null;
  const signedOut = !session.isConnected;
  // A brand-new account signed in for this order: its first test dollars are landing (R4-4, critic gap 10).
  const funding = useFirstFunding();
  const strike = shown ? (call.direction === "long" ? shown.band.lowPrint : shown.band.highPrint) : null;
  const opening = shown?.openingPrint ?? (market.openingPriceRaw !== null ? market.openingPriceRaw / 1_000_000n : null);

  const fundingWaits = !signedOut && funding && q !== null && (spendable === null || spendable < q.quote.stakeBase);
  const fundingClock = useLate(fundingWaits, FUNDING_LATE_MS, nowMs);
  const quoteClock = useLate(q === null && error === null, QUOTE_LATE_MS, nowMs, signature);
  const isFresh = useFreshness(alts?.windows.map((w) => w.market) ?? [], nowMs);
  const priced = q ?? last;
  const fit = priced ? fitAmountBase({ stakeBase: priced.quote.stakeBase, maxPayoutBase: priced.quote.maxPayoutBase, reserve, lockedByExpiryBase: capacity.data?.lockedByExpiryBase ?? null, mode, decimals: USD_DECIMALS }) : null;
  const rungAt = (MOONSHOT_RUNGS as readonly number[]).indexOf(call.multiple);
  const blocker = rangeBlocker({
    game: "moonshot",
    market,
    paused: reserve.paused,
    hasModel: model !== null,
    spot: spot.late ? "late" : spotE8 === null ? "waiting" : "ready",
    amountZero: amountBase === 0n,
    overRungCap: overCap ? { multiple: call.multiple, capText: usd(capBase), capAmountText: formatBaseUnits(capBase, USD_DECIMALS, { group: false, minDp: 0 }) } : null,
    // The open tests the book's centre against a signed spot (2σ, D-119): a stale book is named here, not after the passkey.
    drifted: driftE4 !== null && driftE4 > BigInt(reserve.params.maxDriftE4),
    refusal: error,
    quote: q ? "ready" : quoteClock.late ? "late" : "waiting",
    capacity: capacity.data?.refusal ?? null,
    band: null,
    rung: { lower: MOONSHOT_RUNGS[rungAt - 1] ?? null, higher: MOONSHOT_RUNGS[rungAt + 1] ?? null },
    fitText: fit !== null ? usd(fit) : null,
    funding: !fundingWaits ? "ready" : fundingClock.late ? "late" : "waiting",
    overBalance: !signedOut && q && spendable !== null && spendable < q.quote.stakeBase ? { freeText: usd(spendable), stakeText: usd(q.quote.stakeBase) } : null,
    alts: alts ? alts.windows.map((w) => ({ market: w.market, priced: w.model !== null })) : null,
    isFresh,
  });
  const handlers = {
    setAmount: setAmountText,
    retrySpot: spot.retry,
    retryQuote: () => {
      quoteClock.restart();
      void queryClient.invalidateQueries({ queryKey: rangeKeys.quote(debounced) });
    },
    retryFunds: () => {
      fundingClock.restart();
      void queryClient.invalidateQueries({ queryKey: keys.balanceSheet(session.address) });
    },
    pickWindow: alts?.pick,
    setRung: (multiple: number) => setCall({ ...call, multiple: multiple as MoonshotRung }),
  };
  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  const target = strike !== null ? MOONSHOT.ticket.target(call.direction, usdBand(strike)) : "";
  const fire = () => {
    if (!q || !model?.feed || blocker) return;
    if (signedOut) return session.connectFor(MOONSHOT.ticket.signInFor(target, usd(q.quote.stakeBase)));
    void writes.open({ band: q.rangeBand, feed: model.feed, maxPayoutBase: q.quote.maxPayoutBase, maxStakeBase: mulBpsCeil(q.quote.stakeBase, 10_000 + RANGE_STAKE_HEADROOM_BPS), bandText: target, expirySec: market.expirySec });
  };
  const placed = writes.outcome?.status === "confirmed" ? writes.outcome : null;
  return (
    <div className="rg flex flex-col gap-3">
      <div className="ms-board flex flex-col gap-3">
        <AimPad call={call} onCall={setCall} />
        {opening !== null && strike !== null ? <DistanceGauge opening={opening} strike={strike} spot={spotCents} /> : null}
      </div>
      <TicketStrip
        multiplierMilli={shown?.quote.multiplierMilli ?? null}
        sub={strike !== null && opening !== null ? `${target} · ${signedPct(pctOf(opening, strike))}` : spotE8 === null || error ? RANGE.ticket.noFigure : <WaitingText size="inherit" timeoutMs={null}>{RANGE.block.pricing}</WaitingText>}
        toWinBase={shown?.quote.maxPayoutBase ?? null}
        mode={mode}
        onMode={setMode}
        amountText={amountText}
        onAmount={setAmountText}
        stale={q === null && shown !== null}
        cap={
          // The rung's cap, stated; over it, the CTA is "Use $X payout" (R6 games §4.3.5).
          mode === "fixPayout" ? MOONSHOT.ticket.overCap(call.multiple, usd(capBase)) : null
        }
      >
        {busy || writes.fetchingSpot ? (
          <TxCta state={writes.tx} action={writes.fetchingSpot ? RANGE.cta.fetchingSpot : MOONSHOT.ticket.placing} signer="passkey" sponsored onConfirm={() => undefined} />
        ) : blocker || !q ? (
          blocker ? <RangeCta blocker={blocker} handlers={handlers} /> : null
        ) : (
          <HoldToConfirm className="ts-hold w-full" confirmLabel={signedOut ? RANGE.cta.signingIn : MOONSHOT.ticket.placing} onConfirm={fire}>
            {MOONSHOT.ticket.place2(usd(q.quote.stakeBase), usd(q.quote.maxPayoutBase))}
          </HoldToConfirm>
        )}
        <p className="ts-micro">{TX.payoutSetAside}</p>
      </TicketStrip>
      {placed ? (
        <div role="status" className="rg-receipt">
          <p className="type-body-strong">{RANGE.outcome.placed(placed.roundId?.toString() ?? "", placed.bandText, usd(placed.stakeBase), usd(placed.payoutBase))}</p>
          <a href={txUrl(placed.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption underline">{MOONSHOT.ticket.viewTx}</a>
          <SharePill input={() => rangeShare(placed, market, "moonshot", "/games/moonshot")} />
        </div>
      ) : null}
      {writes.outcome?.status === "requote" ? <p role="alert" className="rg-note rg-note--warn">{TX.requote(usd(writes.outcome.stakeBase))}</p> : null}
      {writes.tx.kind === "failed" ? <TxFailureCard state={writes.tx} onRetry={writes.reset} /> : null}
    </div>
  );
}
