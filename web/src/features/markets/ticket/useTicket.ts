"use client";
/**
 * The ticket's composition (Ported from Masayume 68f7a09:web/src/features/markets/ticket/useTicket.ts): market and side
 * live in the URL (a share link reproduces them); inside the no-entry buffer the ticket moves to the next Window and
 * keeps side and stake (FR-9). New: the stake opens at the last one this account filled (D-048, ux-audit fix 9).
 */
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { marketDeepLink } from "@cwf/core/urls";
import { useNextWindow } from "@cwf/markets/react";
import { useCallback, useEffect, useState } from "react";
import { useWindowPhase } from "../data/useWindowPhase";
import { recallStake } from "./stake-memory";

function replaceSelection(marketId: MarketId, side: Side | null): void {
  window.history.replaceState(null, "", marketDeepLink({ marketId, dir: side ?? undefined }));
}

export function useTicket({ market, side: urlSide, wallet, nowMs }: { market: EventMarket; side: Side | null; wallet: `0x${string}` | null; nowMs: number }) {
  const [side, setSide] = useState<Side | null>(urlSide);
  const [stakeText, setStakeText] = useState("");
  const [remembered, setRemembered] = useState(false);
  const [advancedFrom, setAdvancedFrom] = useState<EventMarket | null>(null);
  const { phase, openingRaw, openingUnread } = useWindowPhase(market, nowMs);
  const successor = useNextWindow(phase === "noEntryBuffer" ? market : null);

  useEffect(() => setSide(urlSide), [urlSide]);

  // The remembered stake fills an empty field once per account; the user's own typing always wins.
  useEffect(() => {
    const last = recallStake(wallet);
    if (last === null) return;
    setStakeText((text) => {
      if (text !== "") return text;
      setRemembered(true);
      return formatBaseUnits(last, market.decimals, { group: false, minDp: 0 });
    });
  }, [wallet, market.decimals]);

  useEffect(() => {
    if (phase !== "noEntryBuffer" || !successor?.ok || !successor.value || successor.value.marketId === market.marketId) return;
    setAdvancedFrom(market);
    replaceSelection(successor.value.marketId, side);
  }, [phase, successor, market, side]);

  const stakeBase = parseDecimalToBaseUnits(stakeText, market.decimals) ?? 0n;
  const edit = useCallback((text: string) => {
    setRemembered(false);
    setAdvancedFrom(null);
    setStakeText(text);
  }, []);
  const setStakeBase = useCallback((base: bigint) => edit(formatBaseUnits(base, market.decimals, { group: false, minDp: 0 })), [edit, market.decimals]);
  const selectSide = useCallback(
    (next: Side) => {
      setSide(next);
      replaceSelection(market.marketId, next);
    },
    [market.marketId],
  );

  return { market, side, stakeText, stakeBase, remembered, phase, openingRaw, openingUnread, advancedFrom, setStakeText: edit, setStakeBase, selectSide };
}

export type TicketApi = ReturnType<typeof useTicket>;
