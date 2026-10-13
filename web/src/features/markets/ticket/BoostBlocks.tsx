"use client";
/**
 * The ticket at 2×/3× (R4-3, D-227; Owarine 90a91d71 Ticket.tsx `boosted`): the same composition as the plain order — the
 * strip shows the reserve's own sizing (`useBoostTicket` → `sizeForStake`), the knock-out line is the strip's note, and
 * only the CTA changes: the hold that opens the Boost (Masayume 68f7a09 `useLeverageWrites`, ported in BoostTicketMode),
 * every refusal named on the button before anything is signed. Signed out, the button opens sign-in for the Boost.
 */
import { USD_DECIMALS } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { TxCta, TxFailureCard } from "@/components/tx";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { BOOST } from "@/features/boost/copy";
import type { useBoostTicket } from "@/features/boost/useBoostTicket";
import type { useBoostWrites } from "@/features/boost/useBoostWrites";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import type { ReadoutCells } from "./StatusBlocks";

type BoostTicket = ReturnType<typeof useBoostTicket>;
type BoostWrites = ReturnType<typeof useBoostWrites>;

const usd = (b: bigint) => `$${formatBaseUnits(b, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;
const contracts = (raw: bigint) => formatBaseUnits(raw, USD_DECIMALS, { minDp: 0, maxDp: 2 });

/** Cost · Return · Max loss for a Boost: the stake, what it collects if it lands, and the stake again (its loss cap). */
export function boostCells(boost: BoostTicket): ReadoutCells {
  const q = boost.quote;
  return q ? { cost: usd(q.stakeBase), ret: usd(q.winIfRightBase), loss: usd(q.stakeBase) } : { cost: null, ret: null, loss: null };
}

/** Why there is no Boost quote yet, in the CTA's words — "Sizing the boost…" while the reserve is still being read, not
 *  the reserve's refusal (`useBoostTicket` names a missing reserve state "Quote unavailable" before its first read). */
export function boostWhy(boost: BoostTicket): string {
  return boost.loading ? BOOST.cta.pricing : (boost.blocker ?? BOOST.cta.pricing);
}

export function BoostCta({ boost, writes, multiple }: { boost: BoostTicket; writes: BoostWrites; multiple: number }) {
  const session = useWalletSession();
  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  if (!session.isConnected) {
    return (
      <button type="button" data-primary-action="" onClick={() => session.connectFor(BOOST.cta.signInFor)} className="min-h-touch w-full rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">
        {BOOST.cta.signIn}
      </button>
    );
  }
  if (busy || writes.fetchingSpot) return <TxCta state={writes.tx} action={writes.fetchingSpot ? BOOST.cta.fetchingSpot : BOOST.cta.placing} signer="passkey" sponsored onConfirm={() => undefined} />;
  if (boost.loading || boost.blocker || !boost.quote) {
    return (
      <button type="button" disabled aria-disabled className="min-h-touch w-full cursor-not-allowed rounded-md border border-hairline bg-surface-2 px-4 type-body-strong text-ink-secondary">
        {boostWhy(boost)}
      </button>
    );
  }
  const args = boost.openArgs;
  return (
    <HoldToConfirm className="w-full" confirmLabel={BOOST.cta.placing} onConfirm={() => args && void writes.open(args)}>
      {BOOST.cta.place(multiple, usd(boost.quote.stakeBase))}
    </HoldToConfirm>
  );
}

/** What the Boost's receipt said: placed (with its figures, or that they're on Portfolio once read), or why it failed. */
export function BoostOutcome({ writes }: { writes: BoostWrites }) {
  if (writes.tx.kind === "failed") return <TxFailureCard state={writes.tx} onRetry={writes.reset} />;
  if (writes.outcome?.status !== "confirmed") return null;
  const booked = writes.outcome.booked;
  return (
    <div role="status" className="flex flex-col gap-1 rounded-lg bg-cream p-3 text-cream-ink">
      <p className="type-body-strong">{booked ? BOOST.outcome.placed(booked.positionId.toString(), booked.leverageBps / 10_000, contracts(booked.quantityRaw), usd(booked.stakeBase)) : BOOST.outcome.placedUnread}</p>
      <a href={txUrl(writes.outcome.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption underline">{BOOST.outcome.viewReceipt}</a>
    </div>
  );
}
