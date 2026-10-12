"use client";
// The account's open parlay tickets and Range rounds for the positions list (D-227): only those still running — a won
// ticket waits in Collect, a void one is refunded, a lost one is done. The same reads (and keys) as /games' slips.
import type { Address } from "@cwf/core";
import { listParlaysOf } from "@cwf/markets/parlay";
import { listRangeRoundViews } from "@cwf/markets/range";
import { useReadingQuery } from "@cwf/markets/react";
import { useMemo } from "react";

const POLL_MS = 8_000;

export function useTerminalBets(address: Address | null) {
  const tickets = useReadingQuery(["cwf", "parlay", "tickets", address], () => listParlaysOf(address!), { pollMs: POLL_MS, enabled: address !== null });
  const rounds = useReadingQuery(["cwf", "range", "rounds", address], () => listRangeRoundViews(address!), { pollMs: POLL_MS, enabled: address !== null });
  return useMemo(() => {
    const parlays = tickets?.ok ? tickets.value.filter((t) => t.status === "live") : [];
    const ranges = rounds?.ok ? rounds.value.filter((r) => r.status === "live") : [];
    // What the totals count them by: the stake in, nothing realised before the close.
    const rows = [...parlays.map((t) => ({ id: `parlay:${t.parlayId}`, costBase: t.stakeBase, realizedBase: 0n })), ...ranges.map((r) => ({ id: `range:${r.roundId}`, costBase: r.stakeBase, realizedBase: 0n }))];
    return { parlays, ranges, rows };
  }, [tickets, rounds]);
}
