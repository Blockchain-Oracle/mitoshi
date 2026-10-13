"use client";
/**
 * The bridge card's state (R4-12, D-227): direction, stock and amount; every read through `@cwf/markets/stocks` (route
 * links, today's room, the linked Robinhood wallet's balances, the Tempo account's, a live quote); the measured ETA
 * from `/api/bridge`; the CTA ladder (`./blockers`); and the two sends — bridge-in from the linked Robinhood wallet
 * (`sendBridgeIn`, the write boundary), bridge-out through the Tempo submitter (one passkey prompt). The source hash
 * is recorded with `/api/bridge` the moment the wallet returns it, and handed to the tracker.
 */
import { fromShared, parseDecimalToBaseUnits, STOP_CHAIN_ID, type BridgeDirection, type BridgeTicker, type Hex } from "@cwf/core";
import { bridgeInCalls, browserBridgeClients, quoteBridgeIn, quoteBridgeOut, readRobinhoodBalances, readRobinhoodHoldings, readRouteCapacity, readRouteLinks, readTempoHoldings, sendBridgeIn, type BridgeClients } from "@cwf/markets/stocks";
import { useReadingQuery } from "@cwf/markets/react";
import { useCallback, useMemo, useState } from "react";
import { useTxLifecycle } from "@/components/tx";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { useDebounced } from "../markets/ticket/useDebounced";
import { nextStep } from "./blockers";
import type { Tracked } from "./useTracker";
import { NETWORK, recordTransfer, useBridgeApi } from "./api";

export { NETWORK, recordTransfer, useBridgeApi, type BridgeApi } from "./api";

export const RH_CHAIN_ID = STOP_CHAIN_ID[NETWORK].robinhood!;
export const FAUCET_URL = "https://faucet.testnet.chain.robinhood.com/";

let clients: Promise<BridgeClients> | null = null;
export const bridgeClients = () => (clients ??= browserBridgeClients(NETWORK));

export function useBridge(initialTicker: BridgeTicker, onTracked: (t: Tracked) => void) {
  const shell = useWalletShell();
  const [direction, setDirection] = useState<BridgeDirection>("in");
  const [ticker, setTicker] = useState<BridgeTicker>(initialTicker);
  const [amount, setAmount] = useState("");
  const [sideStep, setSideStep] = useState<"approve" | "approving" | "send" | null>(null);
  const [sideError, setSideError] = useState<string | null>(null);
  const tx = useTxLifecycle();
  const tempoAddr = shell.tempo?.address ?? null;
  const rhAddr = shell.robinhood?.address ?? null;
  const parsed = parseDecimalToBaseUnits(amount, 6);
  const amountSD = parsed !== null && parsed > 0n ? parsed : null;
  const debounced = useDebounced(amountSD, 350);

  const links = useReadingQuery(["bridge", NETWORK, "links", ticker], async () => readRouteLinks(await bridgeClients(), ticker), { pollMs: 60_000 });
  const capacity = useReadingQuery(["bridge", NETWORK, "capacity", ticker, direction], async () => readRouteCapacity(await bridgeClients(), ticker, direction), { pollMs: 30_000 });
  const rh = useReadingQuery(["bridge", NETWORK, "rh", ticker, rhAddr], async () => readRobinhoodHoldings(await bridgeClients(), ticker, rhAddr!), { enabled: Boolean(rhAddr), pollMs: 15_000 });
  const rhAll = useReadingQuery(["bridge", NETWORK, "rh-all", rhAddr], async () => readRobinhoodBalances(await bridgeClients(), rhAddr!), { enabled: Boolean(rhAddr), pollMs: 30_000 });
  const tempo = useReadingQuery(["bridge", NETWORK, "tempo", ticker, tempoAddr], async () => readTempoHoldings(await bridgeClients(), ticker, tempoAddr!), { enabled: Boolean(tempoAddr), pollMs: 15_000 });
  const linkRead = links?.ok ? links.value : null;
  const routeLive = linkRead ? (direction === "in" ? linkRead.inReady : linkRead.outReady) : false;
  const recipient = direction === "in" ? tempoAddr : rhAddr;
  const quote = useReadingQuery(
    ["bridge", NETWORK, "quote", direction, ticker, debounced?.toString() ?? "", recipient],
    async () => (direction === "in" ? quoteBridgeIn(await bridgeClients(), ticker, fromShared(debounced!, 18), recipient!) : quoteBridgeOut(await bridgeClients(), ticker, debounced!, recipient!)),
    { enabled: routeLive && debounced !== null && Boolean(recipient), pollMs: 30_000 },
  );
  const api = useBridgeApi([tempoAddr, rhAddr]);
  // Only a quote for the amount on screen counts (one for the previous keystroke is never shown or sent).
  const fresh = quote?.ok && debounced === amountSD ? quote.value : null;

  const step = nextStep({
    direction,
    amountSD,
    robinhood: shell.robinhood ? { chainId: shell.robinhood.chainId } : null,
    robinhoodChainId: RH_CHAIN_ID,
    signedIn: Boolean(tempoAddr),
    rh: rh?.ok ? rh.value : null,
    tempo: tempo?.ok ? tempo.value : null,
    links: linkRead,
    linksFailed: links !== null && !links.ok,
    capacity: capacity?.ok ? capacity.value : null,
    quote: fresh,
    paused: linkRead ? linkRead.mirrorPaused || (direction === "out" && linkRead.sendsPaused) : false,
  });

  // The record carries what actually leaves (the quote's, after dust), checked later against the source's OFTSent.
  const track = useCallback((srcTx: Hex, sentSD: bigint, from: string, to: string) => {
    const t: Tracked = { direction, ticker, srcTx, amountSD: sentSD.toString(), startedAtMs: Date.now() };
    void recordTransfer({ ...t, from, to });
    onTracked(t);
  }, [direction, ticker, onTracked]);

  const submit = useCallback(async () => {
    if (!fresh) return;
    setSideError(null);
    if (direction === "out") {
      await tx.run({ kind: "bridge-send", ticker, amountSD: fresh.sentSD, recipient: rhAddr!, feeBase: fresh.nativeFee }, (hash) => track(hash, fresh.sentSD, tempoAddr!, rhAddr!));
      return;
    }
    try {
      const c = await bridgeClients();
      const wallet = await shell.sideWallet(RH_CHAIN_ID);
      const calls = bridgeInCalls(ticker, NETWORK, fresh, rhAddr!, rh?.ok ? rh.value.allowanceLD : 0n);
      const hash = await sendBridgeIn(wallet, c.robinhood, calls, { onStep: (s, h) => setSideStep(s === "approve" && h ? "approving" : s) });
      track(hash, fresh.sentSD, rhAddr!, tempoAddr!);
    } catch (error) {
      const text = error instanceof Error ? error.message.split("\n")[0]! : String(error);
      setSideError(/reject|denied|cancel/i.test(text) ? null : text.slice(0, 160));
    } finally {
      setSideStep(null);
    }
  }, [fresh, direction, tx, ticker, rhAddr, tempoAddr, track, shell, rh]);

  const flip = useCallback(() => {
    setDirection((d) => (d === "in" ? "out" : "in"));
    setAmount("");
  }, []);

  return useMemo(
    () => ({ direction, flip, ticker, setTicker, amount, setAmount, amountSD, step, links, capacity, rh, rhAll, tempo, quote: fresh, api, tx, sideStep, sideError, submit, shell }),
    [direction, flip, ticker, amount, amountSD, step, links, capacity, rh, rhAll, tempo, fresh, api, tx, sideStep, sideError, submit, shell],
  );
}

export type BridgeModel = ReturnType<typeof useBridge>;
