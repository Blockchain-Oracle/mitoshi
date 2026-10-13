"use client";
// What Windows that have their answer still owe the account outside its open rows (D-227): the wallet's waits for the
// settler (after its claim grace) or a collect — read with the wallet's balance in one block, less any Window a row
// still shows — and the Trading Balance's waits for its crank (the same read as its rows). The terminal's equity and
// /portfolio's money card count them, so a position never leaves either at the answer and comes back at the payout.
import type { Address } from "@cwf/core";
import { keys, useBalanceSheet, useVaultBets } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { collectOutsideBase, vaultOwedBase } from "./positions-totals";
import type { TerminalPosition } from "./terminal-positions";

export function useOwed(address: Address | null, rows: readonly TerminalPosition[]): { collectBase: bigint; vaultBase: bigint } {
  const sheet = useBalanceSheet(address);
  const bets = useVaultBets(address);
  const queryClient = useQueryClient();
  // A wallet row that leaves the list (its Window answered, or it sold) re-reads the sheet at once: its payout reaches
  // the collect leg without waiting out the sheet's own poll.
  const shown = rows.filter((r) => r.via === "wallet").map((r) => r.marketId.toLowerCase()).sort().join(",");
  const prev = useRef(shown);
  useEffect(() => {
    const gone = prev.current.split(",").some((id) => id !== "" && !shown.includes(id));
    prev.current = shown;
    if (gone && address) void queryClient.invalidateQueries({ queryKey: keys.balanceSheet(address) });
  }, [shown, address, queryClient]);
  return { collectBase: sheet?.ok ? collectOutsideBase(sheet.value, rows) : 0n, vaultBase: bets?.ok ? vaultOwedBase(bets.value) : 0n };
}
