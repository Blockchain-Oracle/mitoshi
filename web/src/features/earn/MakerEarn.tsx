"use client";
/**
 * `/earn`'s maker tab (Owarine 90a91d71 `features/earn/MakerEarn.tsx` on the deployed `MarketMakerVault`; R4-7, D-227):
 * the reserve card, the action, your position, and §02 the capital map. The maker is the ops earn-quoter's key; with
 * none set the card says the maker is off. Every figure is the vault's own read; the page waits on one skeleton.
 */
import { makerSheet, supplierPosition } from "@cwf/core";
import type { MakerVaultState } from "@cwf/core/maker";
import { useBalanceSheet } from "@cwf/markets/react";
import { ReadingBoundary } from "@/components/states";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { ActionCard } from "./ActionCard";
import { CapitalMap } from "./CapitalMap";
import { useMakerVault, useMakerWindows, useReserveShares, useSupplyLedger } from "./data";
import { EarnLayout, signerOf } from "./EarnLayout";
import { NotDeployed, ReserveCard } from "./ReserveCard";
import { RESERVES } from "./reserves";
import { hasPosition, SupplyPosition } from "./SupplyPosition";
import { useEarnWrites } from "./useEarnWrites";

const WORDS = RESERVES.maker;
const HISTORY = 10;

export function MakerEarn() {
  const reading = useMakerVault();
  return (
    <ReadingBoundary reading={reading} shape="earn">
      {(state) => (state ? <Page vault={state} /> : <NotDeployed />)}
    </ReadingBoundary>
  );
}

function Page({ vault }: { vault: MakerVaultState }) {
  const session = useWalletSession();
  const address = session.address;
  const balance = useBalanceSheet(address);
  const shares = useReserveShares("maker", address);
  const ledger = useSupplyLedger("maker", address);
  const windows = useMakerWindows(HISTORY);
  const nowMs = useNowMs();
  const writes = useEarnWrites("maker", address);
  const sheet = makerSheet(vault);
  const held = supplierPosition(sheet, shares?.ok ? shares.value.shares : 0n, shares?.ok ? shares.value.worthBase : 0n);
  const ledgerValue = ledger?.ok ? ledger.value : null;
  const open = windows?.ok ? windows.value.open : [];
  const unsettledExpired = nowMs > 0 && open.some((r) => !r.view.settled && r.market !== null && r.market.expirySec * 1000 <= nowMs);
  const signedIn = address !== null;
  return (
    <EarnLayout
      title={WORDS.label}
      card={<ReserveCard sheet={sheet} words={WORDS} makerOff={!vault.paused && vault.maker === null} />}
      action={(keypad) => (
        <ActionCard sheet={sheet} words={WORDS} writes={writes} signedIn={signedIn} signer={signerOf(session.kind)} walletBase={balance?.ok ? balance.value.spendableBase : null} held={held} unsettledExpired={unsettledExpired} onSignIn={session.connectFor} keypad={keypad} />
      )}
      position={signedIn && hasPosition(held, ledgerValue) ? <SupplyPosition sheet={sheet} held={held} ledger={ledgerValue} ledgerPending={ledger === null} /> : null}
      map={
        <ReadingBoundary reading={windows} shape="table">
          {(w) => <CapitalMap vault={vault} open={w.open} history={w.history} nowMs={nowMs} writes={writes} onSignIn={session.connectFor} />}
        </ReadingBoundary>
      }
    />
  );
}
