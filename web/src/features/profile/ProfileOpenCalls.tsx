"use client";
// The wallet's open calls (R4-10, D-227): every position it holds, valued as /portfolio and the terminal value them
// (`usePortfolioPositions` + `PositionValuers`), as /portfolio's rows — the cash-out only on your own profile.
import type { Address } from "@cwf/core";
import { useLanes } from "@cwf/markets/react";
import { LoadingState } from "@/components/states";
import { BetRow } from "@/features/markets/portfolio/BetRow";
import { PositionValuers, usePortfolioPositions } from "@/features/markets/portfolio/usePortfolioPositions";
import { useWalletSession } from "@/lib/wallet-session";
import { PROFILE as P } from "./copy";
import "@/styles/history.css";

export function ProfileOpenCalls({ address }: { address: Address }) {
  const lanes = useLanes();
  const book = usePortfolioPositions(address);
  const viewer = useWalletSession().address;
  const own = viewer !== null && viewer.toLowerCase() === address.toLowerCase();
  if (lanes === null) return <LoadingState shape="row" />;
  if (book.groups.length === 0) return <p className="prf-quiet">{P.sections.open.empty}</p>;
  return (
    <>
      <PositionValuers positions={book.positions} onValue={book.onValue} />
      <ul className="bets-list">
        {book.groups.map((g) => (
          <BetRow key={g.key} legs={g.legs} values={book.values} wallet={address} readOnly={!own} />
        ))}
      </ul>
    </>
  );
}
