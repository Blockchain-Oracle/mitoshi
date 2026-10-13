"use client";
// A launched stablecoin's page (S17a; R4-11, D-227): its supply and cap, its DEX flip orders (read from the DEX's own
// events) and its FeeAMM pool — what lets it pay network fees — straight from the chain. No launch at the address says so.
import type { Address } from "@cwf/core";
import { useStablecoinLaunch } from "@cwf/markets/react";
import { GroupedList } from "@/components/kit/GroupedList";
import { LAUNCH } from "./copy";
import { coinText, usdText } from "./format";
import { LogoDisc } from "./LogoDisc";
import "@/components/kit/kit.css";

const K = LAUNCH.token;
const S = K.stable;

export function StablecoinView({ token }: { token: Address }) {
  const s = useStablecoinLaunch(token);
  if (s === null) return <section className="lp-page"><p role="status" className="lp-note">{K.reading}</p></section>;
  if (!s.ok) return <section className="lp-page"><p role="alert" className="lp-note">{K.failed}</p></section>;
  if (!s.value) return <section className="lp-page"><p className="lp-note">{K.missing}</p></section>;
  const v = s.value;
  return (
    <section className="lp-page lp-token">
      <header className="lp-token-head">
        <LogoDisc uri={v.logoURI} symbol={v.symbol} size="lg" />
        <span className="lp-row-id">
          <span className="lp-row-name">{v.name}</span>
          <span className="lp-row-sym">{v.symbol} · {v.currency}</span>
        </span>
      </header>
      <dl className="lp-facts">
        <div><dt>{S.supply}</dt><dd className="numbers">{coinText(v.totalSupply)}</dd></div>
        <div><dt>{S.cap}</dt><dd className="numbers">{v.supplyCap === null ? S.none : coinText(v.supplyCap)}</dd></div>
        <div><dt>{S.fees}</dt><dd className="numbers">{usdText(v.feePool.reserveValidatorToken)}</dd></div>
      </dl>
      <GroupedList title={S.orders}>
        {v.orders.length === 0 ? <div className="kit-item"><span className="kit-item-detail">{S.none}</span></div> : v.orders.map((o) => (
          <div key={o.orderId.toString()} className="kit-item">
            <span className="kit-item-label">{o.isBid ? S.bid : S.ask} · {S.tick} {o.tick}{o.isFlip ? ` → ${o.flipTick}` : ""}</span>
            <span className="kit-item-detail numbers">{coinText(o.remaining)}</span>
          </div>
        ))}
      </GroupedList>
    </section>
  );
}
