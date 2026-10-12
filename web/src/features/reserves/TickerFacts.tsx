"use client";
// One ticker's facts (R4-12, D-227): Owarine 90a91d71 `features/earn/ReserveBounds.tsx` — the contracts' own numbers,
// never a projection — as a key-value list (21st 25162): where each contract lives, who may mint, the cap, pause state
// in plain words (ST-15), the ERC-8056 multiplier and when Robinhood last synced it, and today's room.
import { addressUrl, shortHex, type Network } from "@cwf/core";
import type { TickerReserve } from "@cwf/markets/stocks";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { multiplier, sd, span } from "../bridge/format";
import { RESERVES } from "./copy";

const F = RESERVES.facts;
/** StockSync status flags (contracts/src/common/BridgeTypes.sol): token or registry paused on Robinhood. */
const RH_PAUSED = 0b11;

function link(address: string, network: Network, chain: "tempo" | "robinhood") {
  return (
    <a href={addressUrl(address as `0x${string}`, network, chain)} target="_blank" rel="noreferrer" title={address}>
      {shortHex(address, 6, 4)} ↗
    </a>
  );
}

function issuer(t: TickerReserve): { value: string; note?: string } {
  const holders = t.reads.issuers;
  if (holders === null) return t.facts.adapterIsIssuer ? { value: F.issuerHolds, note: F.issuerUnscanned } : { value: F.issuerMissing };
  const adapter = t.contracts.adapter!.toLowerCase();
  const others = holders.filter((h) => h.toLowerCase() !== adapter).length;
  return others === 0 && holders.length === 1 ? { value: F.issuerOnly } : { value: F.issuerOthers(others) };
}

export function TickerFacts({ t, network, nowSec }: { t: TickerReserve; network: Network; nowSec: number }) {
  const c = t.contracts;
  const f = t.facts;
  const iss = issuer(t);
  const paused = f.paused ? F.yes : (f.statusFlags & RH_PAUSED) !== 0 ? `${F.no} · Robinhood ${F.yes.toLowerCase()}` : F.no;
  const items: KeyValueItem[] = [
    { label: F.lockbox, value: c.lockbox ? link(c.lockbox, network, "robinhood") : RESERVES.notLive },
    { label: F.mirror, value: c.mirror ? link(c.mirror, network, "tempo") : RESERVES.notLive },
    { label: F.issuer, value: iss.value, description: iss.note },
    { label: F.cap, value: sd(f.supplyCap, 0) },
    { label: F.paused, value: f.sendsPaused ? `${paused} · ${F.sendsPaused}` : paused },
    { label: F.multiplier, value: multiplier(f.multiplierE18) },
    { label: F.synced, value: f.syncedAtSec ? F.ago(span(nowSec - f.syncedAtSec)) : F.never },
    { label: F.left, value: F.of(sd(f.inbound.available, 0), sd(f.inbound.capacity, 0)) },
  ];
  return <KeyValueList items={items} label={F.label(t.ticker)} className="rsv-facts" />;
}
