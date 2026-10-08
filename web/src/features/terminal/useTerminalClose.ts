"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/useTerminalTrade.ts (`close`) — on Mitoshi's cash-out
// lanes (D-197): the wallet's SELL IOC or, for a Trading Balance position, the vault's sell lane (`placeFor` by the
// session key when armed, no prompt). One tap: the floor is the last book read's own floor less the close tolerance,
// so a requote inside the tolerance is taken; outside it, the toast offers "Close for $X".
import { isOk, type ExitQuote, type OrderRoute } from "@cwf/core";
import { diagnosisCopy } from "@cwf/core/copy";
import { getLeverageMark, getLeveragePosition } from "@cwf/markets/leverage";
import { invalidateAfterWrite, useMarketsPort, useSigner, useSubmitter } from "@cwf/markets/react";
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
import { BOOST_KEYS, type TerminalPosition } from "./terminal-positions";

/** An exit that fired is spent: its targets go with the position. */
const clearExits = (p: TerminalPosition) => setExits(p.entryKey, p.side, { tpBase: null, slBase: null }, p.entrySpot ?? 0);

export function useTerminalClose() {
  const submitter = useTapSubmitter();
  const port = useMarketsPort();
  const queryClient = useQueryClient();
  const { address } = useSigner();
  const session = useWalletSession();
  const view = useSessionView();
  // A Boost's close is a reserve write, signed by the passkey (the one-tap key is the engine's, D-136).
  const passkey = useSubmitter();
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const latest = useRef({ submitter, port, address, session, view, passkey });
  latest.current = { submitter, port, address, session, view, passkey };

  /**
   * A Boost's Close (`LeverageReserve.close`): the reserve sells the whole holding into the book, repays what it fronted
   * and pays the owner the rest. The floor is the reserve's mark less the close tolerance (`floorBase` once a requote
   * was offered); a moved book offers "Close for $X" at a fresh mark, $X being what reaches the owner.
   */
  const closeBoost = useCallback(
    async (p: TerminalPosition, why: "close" | "trail" | "tp" | "sl", floorBase?: bigint): Promise<void> => {
      const { passkey: pk, address: wallet, session: sess } = latest.current;
      const b = p.boost!;
      const id = `close-${p.id}`;
      if (!pk || !wallet) return void notify.item({ id, title: TERMINAL.toast.signIn, action: { label: CONNECT.connect, onClick: sess.connect } });
      const freshFloor = async (): Promise<bigint | null> => {
        const m = await getLeverageMark(b.positionId);
        return m.ok && m.value.filledRaw > 0n && m.value.markBase > 0n ? closeFloorBase(m.value.markBase, tradeSettings().closeToleranceBps) : null;
      };
      const floor = floorBase ?? (await freshFloor());
      if (floor === null) return void notify.item({ id, type: "warning", title: TERMINAL.close.noBids, description: TERMINAL.close.noBidsBody(clockText(p.expirySec)) });
      notify.item({ id, type: "loading", title: TERMINAL.close.closing(p.asset) });
      const r = await pk.submitTx({ kind: "leverage-close", positionId: b.positionId, marketId: p.marketId, minProceedsBase: floor });
      void queryClient.invalidateQueries({ queryKey: BOOST_KEYS });
      if (r.status === "confirmed") {
        const after = await getLeveragePosition(b.positionId);
        const paid = after.ok && after.value ? after.value.returnedBase : 0n;
        const pnl = paid - p.costBase;
        closeFeedback(Number(pnl));
        forgetEntry(p.entryKey, p.side);
        void invalidateAfterWrite(queryClient, { wallet, marketId: p.marketId });
        const title = why === "trail" ? TERMINAL.trail.hit(p.asset) : why === "tp" ? TERMINAL.exits.tpHit(p.asset) : why === "sl" ? TERMINAL.exits.slHit(p.asset) : TERMINAL.close.closed(p.asset);
        return void notify.item({ id, title, description: TERMINAL.close.realized(money(pnl, true), money(paid)) });
      }
      if (r.diagnosis.kind === "requote") {
        const next = await freshFloor();
        if (next === null) return void notify.item({ id, type: "warning", title: TERMINAL.close.noBids, description: TERMINAL.close.noBidsBody(clockText(p.expirySec)) });
        const owner = next > b.frontedBase ? next - b.frontedBase : 0n;
        return void notify.item({ id, type: "warning", title: TERMINAL.toast.priceMoved, description: TERMINAL.close.requote(money(owner)), timeout: 8_000, action: { label: TERMINAL.close.closeFor(money(owner)), onClick: () => void closeBoost(p, why, next) } });
      }
      return void notify.item({ id, type: "warning", title: r.status === "unknown" ? TERMINAL.toast.unknown : TERMINAL.close.failed, description: r.status === "unknown" ? TERMINAL.toast.unknownBody : diagnosisCopy(r.diagnosis.kind).headline });
    },
    [queryClient],
  );

  const close = useCallback(
    async (p: TerminalPosition, shown: ExitQuote | null, accept?: ExitQuote, why: "close" | "trail" | "tp" | "sl" = "close", sellRaw?: bigint): Promise<void> => {
      const { submitter: sub, port: prt, address: wallet, session: sess, view: v } = latest.current;
      if (inFlight.current) return;
      if (p.boost) {
        inFlight.current = true;
        setBusy(p.id);
        try {
          return await closeBoost(p, why);
        } finally {
          inFlight.current = false;
          setBusy(null);
        }
      }
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
            if (!partial) forgetEntry(p.entryKey, p.side);
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
    [queryClient, closeBoost],
  );

  return { close, busy };
}
