"use client";
// The cockpit's Identity tab (R4-6, D-227): the ERC-8004 identity card (moved here from the head, automate bug 3), its
// registry as `eip155:<chainId>:<identityRegistry>` from the pinned table (automate bug 4) linked on the explorer, the
// ratings (From 21st.dev 28344 sean0205/c-rating-6, revamped: the mean and its count, then the latest ratings as bars,
// each linked to its transaction — no stars, ERC-8004 values are not stars), and the sealed memory's reader.
import { addressUrl, txUrl, type Address } from "@cwf/core";
import { CHAIN, ERC8004 } from "@cwf/clients";
import { webEnv } from "@/lib/env";
import { MemoryReader } from "../strategies/MemorySection";
import { strategyIdentity } from "../strategies/identity";
import type { StrategyDetailPayload } from "../strategies/protocol";
import { shortAddress } from "../strategies/names";
import { AgentIdCard } from "./AgentIdCard";
import { AGENTS } from "./copy";

const C = AGENTS.cockpit;
const valueOf = (v: string, decimals: number) => Number(v) / 10 ** decimals;

export function IdentityTab({ detail, wallet, copying, onCopy }: { detail: StrategyDetailPayload; wallet: string | null; copying: boolean; onCopy: () => void }) {
  const s = detail.strategy;
  const network = webEnv.markets.network;
  const chainId = network === "mainnet" ? CHAIN.tempo : CHAIN.moderato;
  const identity = ERC8004[chainId].identity;
  const registry = `eip155:${chainId}:${identity}`;
  const ratings = detail.feedback.filter((f) => !f.revoked);
  const values = ratings.map((f) => valueOf(f.value, f.valueDecimals));
  const top = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <div className="cp-overview">
      <div className="cp-col">
        {s.agentId ? (
          <>
            <AgentIdCard name={strategyIdentity(s).name} agentId={s.agentId} registry={registry} runner={s.runner} model={s.agent?.model ?? null} kind={C.identity} />
            <div className="cp-card">
              <span className="cp-stat-label">{C.registry}</span>
              <a className="cp-id-registry hover:text-ink" href={addressUrl(identity as Address, network)} target="_blank" rel="noreferrer">{registry} ↗</a>
            </div>
          </>
        ) : (
          <p className="desk-note text-ink-muted">{shortAddress(s.runner)}</p>
        )}
      </div>
      <div className="cp-col">
        {s.agentId && (
          <section className="cp-card" aria-label={C.ratings}>
            <span className="cp-stat-label">{C.ratings}</span>
            {ratings.length === 0 ? (
              <p className="type-caption text-ink-muted">{C.noRatings}</p>
            ) : (
              <>
                <div className="cp-rate"><b>{s.feedback.mean ? Number(s.feedback.mean).toFixed(2) : "—"}</b><span className="type-caption text-ink-muted">{C.ratingCount(s.feedback.count)}</span></div>
                <div className="cp-rate-bars">
                  {ratings.slice(0, 5).map((f) => {
                    const v = valueOf(f.value, f.valueDecimals);
                    return (
                      <a key={f.txHash} className="cp-rate-row" href={txUrl(f.txHash as `0x${string}`, network)} target="_blank" rel="noreferrer">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="dkit-partition min-w-0 flex-1" aria-hidden><span className="dkit-partition-seg bg-accent" style={{ flexGrow: Math.abs(v) / top }} /></span>
                          <span className="truncate">{f.tag2 || f.tag1}</span>
                        </span>
                        <span className="font-mono tabular-nums">{v.toFixed(2)}</span>
                      </a>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}
        <section className="cp-card" aria-label={C.memory}>
          <span className="cp-stat-label">{C.memory}</span>
          <MemoryReader card={s} wallet={wallet} copying={copying} onCopy={onCopy} />
        </section>
      </div>
    </div>
  );
}
