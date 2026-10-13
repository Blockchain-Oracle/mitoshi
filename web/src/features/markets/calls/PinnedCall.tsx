"use client";
/**
 * One of the user's calls, pinned (D-048; ux-audit fix 2): the Call card while it runs, "Settling…" at the close, then
 * the stamp and its receipt, then "Paid automatically" — on this card, whatever the hero is showing. It stays until the
 * user dismisses it; nothing here waits on a prompt (§2.4 "verdict → paid: 0 prompts").
 */
import type { Address, ClaimableRow } from "@cwf/core";
import { isOk } from "@cwf/core";
import { useClaimables, useMarket, useOpeningPrice, useResolution } from "@cwf/markets/react";
import { X } from "lucide-react";
import { LoadingState } from "@/components/states";
import { useNowMs } from "@/lib/clock";
import { CALL, VERDICT_UI } from "../copy";
import type { PlacedCall } from "../data/calls-store";
import { VerdictCard } from "../verdict/VerdictCard";
import { CallCard } from "./CallCard";
import { isFinal, usePinned } from "./usePinned";

export function PinnedCall({ wallet, call, onDismiss }: { wallet: Address; call: PlacedCall; onDismiss: () => void }) {
  const nowMs = useNowMs();
  const pinned = usePinned(wallet, call.marketId, call.expirySec, nowMs);
  const view = pinned && isOk(pinned) ? pinned.value : undefined;
  const settled = view?.phase === "stamped" || view?.phase === "paid" || view?.phase === "held";
  const market = useMarket(settled ? call.marketId : null);
  const resolution = useResolution(call.marketId, settled);
  const claimables = useClaimables(settled ? wallet : null);
  const opening = useOpeningPrice(call.marketId);
  const rows: ClaimableRow[] | null = claimables && isOk(claimables) ? claimables.value.filter((r) => r.marketId === call.marketId) : null;
  const dismiss = isFinal(view) || (view === null && nowMs > call.expirySec * 1000) ? (
    <button type="button" onClick={onDismiss} className="grid size-touch place-items-center self-end rounded-md text-ink-secondary hover:bg-surface-2" aria-label={`${CALL.dismiss} · ${call.asset}`} title={`${CALL.dismiss} · ${call.asset}`}>
      <X aria-hidden className="size-4" />
    </button>
  ) : null;

  if (settled && view?.verdict && market && isOk(market) && market.value) {
    return (
      <div className="flex flex-col gap-1">
        {dismiss}
        <VerdictCard verdict={view.verdict} pinned={view} market={market.value} resolution={resolution && isOk(resolution) ? resolution.value : null} rows={rows} />
      </div>
    );
  }
  if (settled) return <LoadingState shape="plate" />;
  if (view === null && nowMs > call.expirySec * 1000) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-surface-1 p-4">
        <p className="type-body text-ink-secondary">{VERDICT_UI.noPosition.why}</p>
        {dismiss}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <CallCard card={{ asset: call.asset, intervalSec: call.intervalSec, side: call.side, lineRaw: opening?.ok ? opening.value : null, stakeBase: call.costBase, contractsRaw: call.contractsRaw, decimals: call.decimals, tradingStartSec: call.tradingStartSec, expirySec: call.expirySec, txHash: call.txHash, placedAtMs: call.placedAtMs, resting: call.resting }} />
      {view?.phase === "settling" ? (
        <p className="type-body text-ink-secondary" role="status"><span className="type-body-strong text-ink">{CALL.settling}</span> {VERDICT_UI.settling}</p>
      ) : null}
    </div>
  );
}
