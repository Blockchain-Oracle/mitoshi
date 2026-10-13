"use client";
/**
 * §02 on the maker tab, the capital map (R4-7, D-227; earn spec step 6) — replaces Owarine 90a91d71
 * `features/earn/WindowsTable.tsx`'s total line and table. One bar (the kit CapitalBar, from 21st.dev 35046
 * kuratlielia/usage-meter): a segment per asset the vault has deployed, then what is idle, with a tick at the vault's
 * exposure cap (`maxExposureBps`, the contract's `OverExposure`). Every figure comes from the Windows read — idle is the
 * vault's liquid capital, each asset the sum of its open Windows' `deployedBase` — so the bar and its words always add up
 * (R4-7 bug 3). Legend chips filter the rows; Live | Settled split open Windows from the last settled ones; Settle-all
 * sends every Window the engine has resolved. Merge and Settle are permissionless and sponsored: signed out they open
 * sign-in for that action (D-224).
 */
import { TICKERS, isTickerSymbol, type MarketId } from "@cwf/core";
import type { MakerVaultState } from "@cwf/core/maker";
import type { MakerWindowRow } from "@cwf/markets/maker";
import { useState } from "react";
import { CapitalBar, PillButton, TextTabs, type CapitalSegment } from "@/components/kit";
import SectionHead from "@/components/shell/SectionHead";
import { EARN } from "./copy";
import { bpsOf, bpsPct, money2 } from "./format";
import { RESERVES } from "./reserves";
import type { EarnWrites } from "./useEarnWrites";
import { WindowRow } from "./WindowRow";

const MAX_ASSETS = 4;

/** An asset's own colour, or ink where the brand is near-black (it would vanish on the dark stage). */
function colourOf(asset: string): string {
  if (!isTickerSymbol(asset)) return "var(--color-ink-secondary)";
  const { slug, hex } = TICKERS[asset].brand;
  const n = Number.parseInt(hex.slice(1), 16);
  const luma = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luma < 0.2 ? "var(--color-ink)" : `var(--brand-${slug})`;
}

/** Deployed capital by asset over the open Windows; past four assets the rest is one "Other". */
function byAsset(open: readonly MakerWindowRow[]): { id: string; label: string; base: bigint; count: number }[] {
  const sums = new Map<string, { base: bigint; count: number }>();
  for (const row of open) {
    const asset = row.market?.asset ?? EARN.windows.other;
    const cur = sums.get(asset) ?? { base: 0n, count: 0 };
    sums.set(asset, { base: cur.base + row.view.deployedBase, count: cur.count + 1 });
  }
  const list = [...sums.entries()].map(([id, v]) => ({ id, label: id, ...v })).sort((a, b) => (b.base > a.base ? 1 : b.base < a.base ? -1 : 0));
  if (list.length <= MAX_ASSETS) return list;
  const rest = list.slice(MAX_ASSETS - 1);
  return [...list.slice(0, MAX_ASSETS - 1), { id: EARN.windows.other, label: EARN.windows.other, base: rest.reduce((s, r) => s + r.base, 0n), count: rest.reduce((s, r) => s + r.count, 0) }];
}

interface CapitalMapProps {
  vault: MakerVaultState;
  open: readonly MakerWindowRow[];
  history: readonly MakerWindowRow[];
  nowMs: number;
  writes: EarnWrites;
  onSignIn: (intent: string) => void;
}

export function CapitalMap({ vault, open, history, nowMs, writes, onSignIn }: CapitalMapProps) {
  const { windows, sections } = EARN;
  const [tab, setTab] = useState<"live" | "settled">("live");
  const [asset, setAsset] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const assets = byAsset(open);
  const deployedBase = assets.reduce((s, a) => s + a.base, 0n);
  const wholeBase = deployedBase + vault.liquidBase;
  const shown = assets.find((a) => a.id === asset) ? asset : null;
  const segments: CapitalSegment[] = [
    ...assets.map((a) => ({ id: a.id, label: `${a.label} · ${a.count}`, valueBase: a.base, color: colourOf(a.id) })),
    { id: "idle", label: windows.idle, valueBase: vault.liquidBase, color: "var(--ea-idle)", fixed: true },
  ];
  const settleable = open.filter((r) => r.settleable && !r.view.settled).map((r) => r.view.marketId);
  const guard = (intent: string, act: () => void) => (writes.canSign ? act() : onSignIn(intent));
  const onMerge = (id: MarketId) => guard(windows.signInMerge, () => writes.merge(id));
  const onSettle = (id: MarketId) => guard(windows.signInSettle, () => writes.settle(id));
  const named = new Set(assets.map((a) => a.id).filter((id) => id !== windows.other));
  const bucket = (r: MakerWindowRow) => (r.market && named.has(r.market.asset) ? r.market.asset : windows.other);
  const rows = (tab === "live" ? open : history).filter((r) => shown === null || bucket(r) === shown);
  const empty = tab === "settled" ? windows.emptySettled : vault.maker === null ? windows.noMaker : windows.empty;
  return (
    <section className="ea-map" aria-label={sections.capital.title}>
      <SectionHead
        number={sections.capital.number}
        title={sections.capital.title}
        aside={
          <span className="ea-map-aside">
            <span className="ea-map-live numbers">{windows.liveCount(open.length)}</span>
            {settleable.length > 0 ? (
              <PillButton tone="ink" size="sm" disabled={writes.busyRow !== null} onClick={() => guard(windows.signInSettle, () => writes.settleAll(settleable))}>
                {windows.settleAll(settleable.length)}
              </PillButton>
            ) : null}
          </span>
        }
      />
      <div className="ea-map-card">
        <div className="ea-map-figures">
          <span>
            {windows.deployed} <span className="numbers ea-map-strong">{money2(deployedBase)}</span> <span className="numbers">· {bpsPct(bpsOf(deployedBase, wholeBase))}</span>
          </span>
          <span>
            {windows.idle} <span className="numbers ea-map-strong">{money2(vault.liquidBase)}</span>
          </span>
          {vault.params.maxExposureBps > 0 && vault.params.maxExposureBps < 10_000 ? <span className="ea-map-cap numbers">{windows.cap(bpsPct(vault.params.maxExposureBps))}</span> : null}
        </div>
        <CapitalBar segments={segments} capBps={vault.params.maxExposureBps} format={(b) => money2(b)} label={windows.capitalLabel} onFilter={setAsset} active={shown} />
      </div>
      <TextTabs
        value={tab}
        onChange={setTab}
        label={sections.capital.title}
        tabs={[
          { value: "live", label: <>{windows.live} <span className="ea-tab-n numbers">{open.length}</span></> },
          { value: "settled", label: <>{windows.settled} <span className="ea-tab-n numbers">{history.length}</span></> },
        ]}
      />
      {rows.length === 0 ? (
        <p className="ea-map-empty">{empty}</p>
      ) : (
        <ul className="ea-rows" aria-label={tab === "live" ? windows.live : windows.settled}>
          {rows.map((row) => {
            const key = `${row.view.marketId}:${row.view.settled ? "s" : "o"}`;
            return (
              <WindowRow
                key={key}
                row={row}
                nowMs={nowMs}
                capBase={vault.params.maxWindowDeployedBase}
                busyRow={writes.busyRow}
                lastRow={writes.lastRow}
                rowTx={writes.rowTx}
                open={expanded === key}
                onToggle={() => setExpanded((cur) => (cur === key ? null : key))}
                onMerge={onMerge}
                onSettle={onSettle}
              />
            );
          })}
        </ul>
      )}
      <p className="ea-risk">{RESERVES.maker.risk}</p>
    </section>
  );
}
