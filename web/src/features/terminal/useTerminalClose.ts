"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/useTerminalTrade.ts (`close`) — on Mitoshi's cash-out
// lanes (D-197): the wallet's SELL IOC or, for a Trading Balance position, the vault's sell lane (`placeFor` by the
// session key when armed, no prompt). One tap: the floor is the last book read's own floor less the close tolerance,
// so a requote inside the tolerance is taken; outside it, the toast offers "Close for $X".
import { isOk, type ExitQuote, type OrderRoute } from "@cwf/core";
import { diagnosisCopy } from "@cwf/core/copy";
import { invalidateAfterWrite, useMarketsPort, useSigner } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useSessionView } from "@/features/session";
import { CONNECT } from "@/lib/copy";
import { closeFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { useTapSubmitter } from "@/providers/wallet/tap-session";
import { TERMINAL } from "./copy";
import { forgetEntry, setExits } from "./entries";
import { clockText, money } from "./format";
import { closeFloorBase } from "./position-value";
import { tradeSettings } from "./settings";
import type { TerminalPosition } from "./terminal-positions";

/** An exit that fired is spent: its targets go with the position. */
const clearExits = (p: TerminalPosition) => setExits(p.marketId, p.side, { tpBase: null, slBase: null }, p.entrySpot ?? 0);

export function useTerminalClose() {
  const submitter = useTapSubmitter();
  const port = useMarketsPort();
  const queryClient = useQueryClient();
  const { address } = useSigner();
  const session = useWalletSession();
  const view = useSessionView();
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const latest = useRef({ submitter, port, address, session, view });
  latest.current = { submitter, port, address, session, view };

  const close = useCallback(
    async (p: TerminalPosition, shown: ExitQuote | null, accept?: ExitQuote, why: "close" | "trail" | "tp" | "sl" = "close", sellRaw?: bigint): Promise<void> => {
      const { submitter: sub, port: prt, address: wallet, session: sess, view: v } = latest.current;
      if (inFlight.current) return;
      const id = `close-${p.marketId}`;
      if (!sub || !wallet || !prt) return void notify.item({ id, title: TERMINAL.toast.signIn, action: { label: CONNECT.connect, onClick: sess.connect } });
      inFlight.current = true;
      setBusy(p.id);
      try {
        // Reduce sells part: its own exit read for that size (the row's read is for the whole position).
        const partial = sellRaw !== undefined && sellRaw < p.heldRaw;
        let exit = accept ?? (partial ? null : shown);
        if (!exit) {
          const fresh = await prt.freshExitQuote({ marketId: p.marketId, decimals: p.decimals }, p.side, partial ? sellRaw! : p.heldRaw);
          if (!isOk(fresh)) return void notify.item({ id, type: "warning", title: fresh.error.kind === "market-not-trading" ? TERMINAL.buttons.locked(clockText(p.expirySec)) : diagnosisCopy(fresh.error.kind).headline });
          exit = fresh.value;
        }
        if (!exit) return void notify.item({ id, type: "warning", title: TERMINAL.close.noBids, description: TERMINAL.close.noBidsBody(clockText(p.expirySec)) });
        const displayed = accept ?? { ...exit, minProceedsBase: closeFloorBase(exit.minProceedsBase, tradeSettings().closeToleranceBps) };
        notify.item({ id, type: "loading", title: TERMINAL.close.closing(p.asset) });
        const market = await prt.getMarket(p.marketId);
        if (!isOk(market) || !market.value) return void notify.item({ id, type: "warning", title: TERMINAL.toast.failed, ...(isOk(market) ? {} : { description: diagnosisCopy(market.error.kind).headline }) });
        const route: OrderRoute | undefined = p.via === "vault" ? (v.status === "armed" && v.grant ? { kind: "vault-grant", grantId: v.grant.grantId } : { kind: "vault" }) : undefined;
        const outcome = await sub.submitCashOut({ market: market.value, side: p.side, contractsRaw: exit.contractsRaw, displayedExit: displayed, wallet, ...(route ? { route } : {}) });
        switch (outcome.status) {
          case "confirmed": {
            const sold = outcome.booked.contractsRaw;
            const partial = sold < p.heldRaw;
            const costShare = p.heldRaw > 0n ? (p.costBase * sold) / p.heldRaw : p.costBase;
            const pnl = outcome.booked.proceedsBase - costShare;
            closeFeedback(Number(pnl));
            if (!partial) forgetEntry(p.marketId, p.side);
            void invalidateAfterWrite(queryClient, { wallet, marketId: p.marketId });
            const title = partial ? TERMINAL.close.reduced(p.asset) : why === "trail" ? TERMINAL.trail.hit(p.asset) : why === "tp" ? TERMINAL.exits.tpHit(p.asset) : why === "sl" ? TERMINAL.exits.slHit(p.asset) : TERMINAL.close.closed(p.asset);
            if (!partial && why !== "close") clearExits(p);
            return void notify.item({ id, title, description: why !== "close" && !partial ? TERMINAL.close.lockedIn(money(pnl, true)) : TERMINAL.close.realized(money(pnl, true), money(outcome.booked.proceedsBase)) });
          }
          case "requote": {
            const next = outcome.exit;
            return void notify.item({ id, type: "warning", title: TERMINAL.toast.priceMoved, description: TERMINAL.close.requote(money(next.minProceedsBase)), timeout: 8_000, action: { label: TERMINAL.close.closeFor(money(next.minProceedsBase)), onClick: () => void close(p, next, next, why, sellRaw) } });
          }
          case "nothingFilled":
            return void notify.item({ id, title: TERMINAL.close.nothingSold, description: TERMINAL.close.nothingSoldBody });
          case "unknown":
            return void notify.item({ id, type: "warning", title: TERMINAL.toast.unknown, description: TERMINAL.toast.unknownBody });
          default:
            return void notify.item({ id, type: "warning", title: TERMINAL.close.failed, description: diagnosisCopy(outcome.diagnosis.kind).headline });
        }
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [queryClient],
  );

  return { close, busy };
}
