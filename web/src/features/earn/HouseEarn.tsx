"use client";
/**
 * `/earn`'s house-reserve tabs (Owarine 90a91d71 `features/earn/HouseEarn.tsx`; R4-7, D-227): Range (with Moonshot),
 * Parlay, Boost. The same books and the same two liquidity instructions as the maker vault, so the same card, action and
 * position; §02 is the reserve's capital bar and its own limits where the vault shows its Windows.
 */
import { boostSheet, isOk, parlaySheet, rangeSheet, supplierPosition, type Reading, type ReserveKind, type ReserveSheet } from "@cwf/core";
import { useBalanceSheet } from "@cwf/markets/react";
import { ReadingBoundary } from "@/components/states";
import { useWalletSession } from "@/lib/wallet-session";
import { ActionCard } from "./ActionCard";
import { boostBounds, parlayBounds, rangeBounds, type BoundRow } from "./bounds";
import { EARN } from "./copy";
import { useBoostReserveFor, useParlayReserveFor, useRangeReserveFor, useReserveShares, useSupplyLedger } from "./data";
import { EarnLayout, signerOf } from "./EarnLayout";
import { ReserveBounds } from "./ReserveBounds";
import { ReserveCard } from "./ReserveCard";
import { RESERVES, type ReserveWords } from "./reserves";
import { hasPosition, SupplyPosition } from "./SupplyPosition";
import { useEarnWrites } from "./useEarnWrites";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { earn as earnShape } from "@/components/states/shapes/money";

type HouseKind = Exclude<ReserveKind, "maker">;

/** One reserve's sheet and the limits it publishes, from whichever contract this tab belongs to. */
interface HouseReading {
  sheet: ReserveSheet;
  rows: BoundRow[];
  capBps?: number;
  slots?: { open: number; max: number };
}

/** All three hooks are called (the rules of hooks leave no choice) but only the showing tab's is enabled. */
function useHouseReserve(kind: HouseKind): Reading<HouseReading | null> | null {
  const range = useRangeReserveFor(kind === "range");
  const parlay = useParlayReserveFor(kind === "parlay");
  const boost = useBoostReserveFor(kind === "boost");
  const map = <S,>(reading: Reading<S | null> | null, read: (s: S) => HouseReading): Reading<HouseReading | null> | null => {
    if (!reading) return null;
    if (!isOk(reading)) return reading;
    return { ...reading, value: reading.value === null ? null : read(reading.value) };
  };
  if (kind === "range") return map(range, (s) => ({ sheet: rangeSheet(s), rows: rangeBounds(s), capBps: s.params.maxExposureBps }));
  if (kind === "parlay") return map(parlay, (s) => ({ sheet: parlaySheet(s), rows: parlayBounds(s), capBps: s.params.maxExposureBps }));
  return map(boost, (s) => ({ sheet: boostSheet(s), rows: boostBounds(s), slots: { open: s.openPositions, max: s.params.maxOpenPositions } }));
}

export function HouseEarn({ kind }: { kind: HouseKind }) {
  const words = RESERVES[kind];
  const reading = useHouseReserve(kind);
  return (
    <ReadingBoundary reading={reading} placeholder={<LoadingFrame shape="earn">{earnShape()}</LoadingFrame>}>
      {(state) => (state ? <Page kind={kind} words={words} reading={state} /> : <NotOnThisNetwork words={words} />)}
    </ReadingBoundary>
  );
}

function Page({ kind, words, reading }: { kind: HouseKind; words: ReserveWords; reading: HouseReading }) {
  const session = useWalletSession();
  const address = session.address;
  const balance = useBalanceSheet(address);
  const shares = useReserveShares(kind, address);
  const ledger = useSupplyLedger(kind, address);
  const writes = useEarnWrites(kind, address);
  const { sheet } = reading;
  const held = supplierPosition(sheet, shares?.ok ? shares.value.shares : 0n, shares?.ok ? shares.value.worthBase : 0n);
  const ledgerValue = ledger?.ok ? ledger.value : null;
  const signedIn = address !== null;
  return (
    <EarnLayout
      title={words.label}
      card={<ReserveCard sheet={sheet} words={words} />}
      action={(keypad) => (
        <ActionCard sheet={sheet} words={words} writes={writes} signedIn={signedIn} signer={signerOf(session.kind)} walletBase={balance?.ok ? balance.value.spendableBase : null} held={held} onSignIn={session.connectFor} keypad={keypad} />
      )}
      position={signedIn && hasPosition(held, ledgerValue) ? <SupplyPosition sheet={sheet} held={held} ledger={ledgerValue} ledgerPending={ledger === null} /> : null}
      map={<ReserveBounds sheet={sheet} words={words} rows={reading.rows} capBps={reading.capBps} slots={reading.slots} />}
    />
  );
}

/** The contract is not on this network: the reserve's own line, and that it is not here yet. */
function NotOnThisNetwork({ words }: { words: ReserveWords }) {
  return (
    <div className="ea-map-card ea-absent">
      <p className="type-body text-ink">{EARN.notDeployed.reserve(words.label)}</p>
      {words.blurb ? <p className="type-caption text-ink-secondary">{words.blurb}</p> : null}
    </div>
  );
}
