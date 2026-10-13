"use client";
/**
 * The result card on the Window's own verdict (Ported from Agari 03b30ab:web/src/features/markets/verdict/
 * ClaimWinnings.tsx, over Masayume 68f7a09's): a win shows the profit, the return and stake → payout; a loss "Not this
 * time" with no false cheer; a void the quiet card with "Returned" and its reason. Tempo's settler pays every position
 * a few minutes after the close (`redeemFor`), so the button only hurries it, and a Window it paid says "Paid
 * automatically" with the payout transaction.
 *
 * The references' false "Paid" is fixed at its root (ux-audit §1): "paid" comes only from the chain's own `Redeemed`
 * witness (`getPinnedVerdict` phase `paid`), never from "the claimables list is empty" (true while it loads) or from a
 * collect loop that broke on an error. A payout the receive policy held says so and is never collected.
 */
import type { ClaimableRow, EventMarket, PinnedVerdictView, Resolution, Verdict } from "@cwf/core";
import { VOID_HEADLINE, VOID_SHARE_WORD, voidDetail, voidLines } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { ArrowRight, Check, Loader2, Trophy } from "lucide-react";
import { Hash } from "@/components/data";
import { TxFailureCard } from "@/components/tx";
import { useNowMs } from "@/lib/clock";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { VERDICT_UI } from "../copy";
import { collectableRows, useCollect } from "../claims/useCollect";
import { VerdictStamp } from "./VerdictStamp";

/** The settler's claim grace (D-032): it auto-pays this long after settlement. */
export const AUTO_PAY_GRACE_SEC = 300;

interface ClaimWinningsProps {
  verdict: Verdict;
  pinned: PinnedVerdictView;
  market: Pick<EventMarket, "marketId" | "voidReason" | "lane" | "printSource" | "tradingStartSec" | "lockAtSec" | "expirySec" | "resolvedAtMs">;
  resolution: Resolution | null;
  /** This Window's claimable rows; null while they load (the collect button waits for them). */
  rows: readonly ClaimableRow[] | null;
}

function voidWords(market: ClaimWinningsProps["market"], resolution: Resolution | null) {
  const detail = voidDetail({
    voidReason: market.voidReason, lane: market.lane, primarySource: resolution?.printSource ?? market.printSource, tradingStartSec: market.tradingStartSec,
    lockAtSec: market.lockAtSec, expirySec: market.expirySec, openE8: resolution ? resolution.openingRaw : undefined, closeE8: resolution ? resolution.closingRaw : undefined,
  });
  if (!detail) return null;
  const [headline, reason] = voidLines(detail, { checkSource: null });
  return { shareWord: VOID_SHARE_WORD[detail.reason], headline, reason };
}

export function ClaimWinnings({ verdict, pinned, market, resolution, rows }: ClaimWinningsProps) {
  const { address } = useWalletSession();
  const nowMs = useNowMs();
  const { tx, collect, reset } = useCollect(address);
  // Privacy mode (R4-4, critic gap 15): your own payout and stake hide with every other money figure.
  const hidden = usePrivacy();
  const money = (b: bigint) => (hidden ? SHELL.masked : `$${formatBaseUnits(b, verdict.decimals, { minDp: 2, maxDp: 2 })}`);
  const stake = verdict.costBasisBase ?? 0n;
  const profit = verdict.pnlBase > 0n ? verdict.pnlBase : 0n;
  const roi = stake > 0n ? Number((profit * 100n) / stake) : 0;

  if (verdict.outcome === "loss") {
    return (
      <div className="cw-loss">
        <div className="cw-loss-eyebrow">{VERDICT_UI.claim.notThisTime}</div>
        <p className="cw-loss-body">{VERDICT_UI.claim.lossBody}</p>
      </div>
    );
  }
  if (verdict.payoutBase === 0n) return null;

  const isVoid = verdict.outcome === "void";
  const paid = pinned.phase === "paid";
  const held = pinned.phase === "held";
  const collectable = rows ? collectableRows(rows) : null;
  const busy = tx.kind === "signing" || tx.kind === "submitted";
  const settledSec = market.resolvedAtMs ? Math.floor(market.resolvedAtMs / 1000) : market.expirySec;
  const autoInSec = settledSec + AUTO_PAY_GRACE_SEC - Math.floor(nowMs / 1000);
  // A Trading Balance call (S7) is paid into the balance by the settler's crank: nothing to collect, no grace.
  const intoBalance = pinned.into === "trading-balance";
  const paidWord = intoBalance ? VERDICT_UI.claim.paidIntoBalance : pinned.paidBy === "auto" ? VERDICT_UI.claim.paidAuto : VERDICT_UI.claim.claimed;
  const words = isVoid ? voidWords(market, resolution) : null;

  const footer = paid ? (
    <>
      <div className={isVoid ? "cw-paid cw-void-paid" : "cw-paid"} role="status">
        <Check className="size-4" aria-hidden /> {paidWord}
      </div>
      {pinned.txHash ? <p className="cw-foot">{VERDICT_UI.claim.paidTx} <Hash value={pinned.txHash} href={txUrl(pinned.txHash, webEnv.markets.network)} /></p> : null}
    </>
  ) : intoBalance ? (
    <p className="cw-foot" role="status">{VERDICT_UI.claim.settlingIntoBalance}</p>
  ) : held ? (
    <div className="cw-loss mt-3" role="status">
      <div className="cw-loss-eyebrow">{VERDICT_UI.claim.held}</div>
      <p className="cw-loss-body">{VERDICT_UI.claim.heldBody}</p>
    </div>
  ) : (
    <>
      {tx.kind === "failed" ? <TxFailureCard state={tx} onRetry={reset} className="mt-3" /> : null}
      <button
        type="button"
        onClick={() => collectable && void collect(collectable)}
        disabled={busy || !collectable || collectable.length === 0}
        aria-busy={busy}
        className={isVoid ? "cw-collect cw-void-collect min-h-touch" : "cw-collect min-h-touch"}
      >
        {busy ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> {VERDICT_UI.claim.collecting}</> : VERDICT_UI.claim.collect}
      </button>
      <p className="cw-foot">{autoInSec > 0 ? VERDICT_UI.stampedWait(autoInSec) : isVoid ? VERDICT_UI.claim.voidFoot : VERDICT_UI.claim.foot}</p>
    </>
  );

  if (isVoid) {
    return (
      <div className="cw-loss cw-void">
        <div className="cw-void-head">
          <VerdictStamp outcome="void" size="compact" />
          <div className="cw-void-figure">
            <span className="cw-void-amount">{money(verdict.payoutBase)}</span>
            <div className="cw-loss-eyebrow">{VERDICT_UI.claim.returned}</div>
          </div>
        </div>
        {words && <div className="cw-loss-eyebrow">{words.shareWord}</div>}
        <p className="cw-loss-body">{words?.headline ?? VOID_HEADLINE}</p>
        {words && <p className="cw-void-reason">{words.reason}</p>}
        <div className="cw-win-flow">
          <span>{VERDICT_UI.claim.stake} <span className="cw-num">{money(stake)}</span></span>
          <ArrowRight className="size-3" aria-hidden />
          <span>{VERDICT_UI.claim.returned} <span className="cw-num">{money(verdict.payoutBase)}</span></span>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="cw-win">
      <div className="cw-win-glow" aria-hidden />
      <div className="cw-win-body">
        <div className="cw-win-eyebrow">
          <Trophy className="size-4" aria-hidden />
          <span>{paid ? paidWord : VERDICT_UI.claim.youWon}</span>
        </div>
        <div className="cw-win-hero">
          <div>
            <div className="cw-win-figure"><span className="cw-win-profit">+{money(profit)}</span></div>
            <div className="cw-win-label">{VERDICT_UI.claim.profit}</div>
          </div>
          {roi > 0 && (
            <div className="cw-win-roi">
              <div className="cw-win-roi-value">+{roi}%</div>
              <div className="cw-win-roi-label">{VERDICT_UI.claim.ret}</div>
            </div>
          )}
        </div>
        <div className="cw-win-flow">
          <span>{VERDICT_UI.claim.stake} <span className="cw-num">{money(stake)}</span></span>
          <ArrowRight className="size-3" aria-hidden />
          <span>{VERDICT_UI.claim.payout} <span className="cw-num">{money(verdict.payoutBase)}</span></span>
        </div>
        {footer}
      </div>
    </div>
  );
}
