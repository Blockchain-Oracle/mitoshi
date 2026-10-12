"use client";
/**
 * `/earn`'s house-reserve tabs (Owarine 90a91d71 `features/earn/HouseEarn.tsx`): Range & Moonshot, Parlay, Boost. All
 * three keep the same books and the same two liquidity instructions as the maker vault, so this is the same hero, the
 * same two cards and the reserve's own parameters where the vault shows its Windows.
 */
import { boostSheet, isOk, parlaySheet, rangeSheet, type Reading, type ReserveKind, type ReserveSheet } from "@cwf/core";
import { useBalanceSheet } from "@cwf/markets/react";
import type { ReactNode } from "react";
import SectionHead from "@/components/shell/SectionHead";
import { ReadingBoundary } from "@/components/states";
import { useWalletSession } from "@/lib/wallet-session";
import { boostBounds, parlayBounds, rangeBounds, type BoundRow } from "./bounds";
import { EARN } from "./copy";
import { useBoostReserveFor, useParlayReserveFor, useRangeReserveFor, useReserveShares, useSupplyLedger } from "./data";
import { Hero } from "./Hero";
import { signerOf } from "./MakerEarn";
import { ReserveBounds } from "./ReserveBounds";
import { RESERVES, type ReserveWords } from "./reserves";
import { PositionCard, SupplyCard } from "./SupplyCards";
import { useEarnWrites } from "./useEarnWrites";

type HouseKind = Exclude<ReserveKind, "maker">;

/** One reserve's sheet and the bounds it publishes, from whichever contract this tab belongs to. */
interface HouseReading {
  sheet: ReserveSheet;
  rows: BoundRow[];
}

/** All three hooks are called (the rules of hooks leave no choice) but only the showing tab's is enabled. */
function useHouseReserve(kind: HouseKind, words: ReserveWords): Reading<HouseReading | null> | null {
  const range = useRangeReserveFor(kind === "range");
  const parlay = useParlayReserveFor(kind === "parlay");
  const boost = useBoostReserveFor(kind === "boost");
  const map = <S,>(reading: Reading<S | null> | null, sheetOf: (s: S) => ReserveSheet, bounds: (s: S, sheet: ReserveSheet, words: ReserveWords) => BoundRow[]): Reading<HouseReading | null> | null => {
    if (!reading) return null;
    if (!reading.ok) return reading;
    const state = reading.value;
    if (state === null) return { ...reading, value: null };
    const sheet = sheetOf(state);
    return { ...reading, value: { sheet, rows: bounds(state, sheet, words) } };
  };
  if (kind === "range") return map(range, rangeSheet, rangeBounds);
  if (kind === "parlay") return map(parlay, parlaySheet, parlayBounds);
  return map(boost, boostSheet, boostBounds);
}

export function HouseEarn({ kind, tabs }: { kind: HouseKind; tabs: ReactNode }) {
  const words = RESERVES[kind];
  const reading = useHouseReserve(kind, words);
  const value = reading && isOk(reading) ? reading.value : null;
  const deployed = reading === null || value !== null;
  return (
    <>
      {deployed ? <Hero words={words} sheet={value?.sheet ?? null} /> : null}
      {tabs}
      <ReadingBoundary reading={reading} shape="tiles" className="container">
        {(state) => (state ? <Page kind={kind} words={words} reading={state} /> : <NotOnThisNetwork words={words} />)}
      </ReadingBoundary>
    </>
  );
}

function Page({ kind, words, reading }: { kind: HouseKind; words: ReserveWords; reading: HouseReading }) {
  const session = useWalletSession();
  const address = session.address;
  const balance = useBalanceSheet(address);
  const shares = useReserveShares(kind, address);
  const ledger = useSupplyLedger(kind, address);
  const writes = useEarnWrites(kind, address);
  const walletBase = balance?.ok ? balance.value.spendableBase : null;
  const held = shares?.ok ? shares.value : { shares: 0n, worthBase: 0n };
  const { sheet } = reading;
  const { sections } = EARN;
  return (
    <div className="container ea-main">
      <SectionHead number={sections.supply.number} title={words.supplyTitle} meta={words.supplyMeta} />
      {sheet.paused ? (
        <div className="ea-paused" role="status">
          <p className="ea-paused-title">{EARN.paused.title}</p>
          <p className="ea-paused-body">{EARN.paused.reserveBody}</p>
        </div>
      ) : null}
      <div className="ea-cards">
        <SupplyCard signedIn={address !== null} signer={signerOf(session.kind)} sheet={sheet} walletBase={walletBase} tx={writes.supplyTx} onSupply={writes.supply} onSignIn={session.connectFor} />
        <PositionCard signedIn={address !== null} signer={signerOf(session.kind)} sheet={sheet} words={words} shares={held.shares} worthBase={held.worthBase} ledger={ledger?.ok ? ledger.value : null} tx={writes.withdrawTx} note={writes.note} onWithdraw={(s) => void writes.withdraw(s)} />
      </div>
      <SectionHead number={sections.windows.number} title={words.boundsTitle} meta={words.boundsMeta} />
      <ReserveBounds rows={reading.rows} risk={words.risk} />
    </div>
  );
}

/** The contract is not on this network: the reserve's own words, and what it depends on. */
function NotOnThisNetwork({ words }: { words: ReserveWords }) {
  return (
    <div className="container">
      <div className="ea-bounds">
        <p className="ea-bound-note">{words.blurb}</p>
        <p className="ea-risk">{EARN.notDeployed.reserve(words.label)}</p>
      </div>
    </div>
  );
}
