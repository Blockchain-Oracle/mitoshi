"use client";
/**
 * `/earn`'s maker tab (Owarine 90a91d71 `features/earn/MakerEarn.tsx` on the deployed `MarketMakerVault`): the hero with
 * the live panel, §01 supply and your position, §02 where the capital is. The maker is the ops earn-quoter's key; with
 * none set the panel says quoting is off.
 */
import { isOk, makerSheet } from "@cwf/core";
import type { MakerVaultState } from "@cwf/core/maker";
import { useBalanceSheet } from "@cwf/markets/react";
import type { ReactNode } from "react";
import SectionHead from "@/components/shell/SectionHead";
import { ReadingBoundary } from "@/components/states";
import { TxFailureCard, type SignerKind } from "@/components/tx";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { EARN } from "./copy";
import { useMakerVault, useMakerWindows, useReserveShares, useSupplyLedger } from "./data";
import { Hero, NotDeployed } from "./Hero";
import { RESERVES } from "./reserves";
import { PositionCard, SupplyCard } from "./SupplyCards";
import { useEarnWrites } from "./useEarnWrites";
import { WindowsTable } from "./WindowsTable";

const WORDS = RESERVES.maker;
const HISTORY = 10;

export function MakerEarn({ tabs }: { tabs: ReactNode }) {
  const reading = useMakerVault();
  const vault = reading && isOk(reading) ? reading.value : null;
  const deployed = reading === null || vault !== null;
  const status = vault && !vault.paused && vault.maker === null ? EARN.panel.noMaker : undefined;
  return (
    <>
      {deployed ? <Hero words={WORDS} sheet={vault ? makerSheet(vault) : null} status={status} /> : null}
      {tabs}
      <ReadingBoundary reading={reading} shape="plate" className="container">
        {(state) => (state ? <Page vault={state} /> : <NotDeployed />)}
      </ReadingBoundary>
    </>
  );
}

export function signerOf(kind: string | null): SignerKind {
  return kind === "passkey" ? "passkey" : "injected";
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
  const walletBase = balance?.ok ? balance.value.spendableBase : null;
  const held = shares?.ok ? shares.value : { shares: 0n, worthBase: 0n };
  const open = windows?.ok ? windows.value.open : [];
  const history = windows?.ok ? windows.value.history : [];
  const unsettledExpired = nowMs > 0 && open.some((r) => r.market !== null && r.market.expirySec * 1000 <= nowMs);
  const sheet = makerSheet(vault);
  const { sections } = EARN;
  return (
    <div className="container ea-main">
      <SectionHead number={sections.supply.number} title={WORDS.supplyTitle} meta={WORDS.supplyMeta} />
      {vault.paused ? (
        <div className="ea-paused" role="status">
          <p className="ea-paused-title">{EARN.paused.title}</p>
          <p className="ea-paused-body">{EARN.paused.body}</p>
        </div>
      ) : null}
      <div className="ea-cards">
        <SupplyCard signedIn={address !== null} signer={signerOf(session.kind)} sheet={sheet} walletBase={walletBase} tx={writes.supplyTx} onSupply={writes.supply} onSignIn={session.connectFor} />
        <PositionCard signedIn={address !== null} signer={signerOf(session.kind)} sheet={sheet} words={WORDS} shares={held.shares} worthBase={held.worthBase} ledger={ledger?.ok ? ledger.value : null} unsettledExpired={unsettledExpired} tx={writes.withdrawTx} note={writes.note} onWithdraw={(s) => void writes.withdraw(s)} />
      </div>
      <SectionHead number={sections.windows.number} title={sections.windows.title} meta={sections.windows.meta} />
      <WindowsTable open={open} history={history} nowMs={nowMs} busyRow={writes.busyRow} canSign={writes.canSign} onMerge={writes.merge} onSettle={writes.settle} />
      {writes.rowTx.state.kind === "failed" ? <TxFailureCard state={writes.rowTx.state} onRetry={() => writes.rowTx.dispatch({ type: "reset" })} /> : null}
    </div>
  );
}
