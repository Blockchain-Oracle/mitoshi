/**
 * reserve-watch (S14 14o; D-227 R4-12): every 5 minutes, one snapshot per ticker into `reserve_snapshots` — what the
 * Robinhood lockbox holds, what the Base hop carries and what Tempo minted and deferred, at stated blocks, checked by
 * `@cwf/core` `conservation`. It alerts (heartbeat + the snapshot's `alert`) when anyone but the adapter holds a mirror's
 * ISSUER_ROLE or a check fails. The issuer holder set is carried snapshot to snapshot (its first pass scans the role
 * events from the stocks fragment's first block, paced by the ops RPC budget). Signs nothing; needs DATABASE_URL.
 */
import { reserveVerdict, type BridgeTicker } from "@cwf/core";
import { createPgReserveStore } from "@cwf/db";
import { createOpsClient } from "@cwf/markets/ops";
import { readReserves, sideClients, type BridgeClients, type KnownIssuers, type TickerReserve } from "@cwf/markets/stocks";
import { runActor, type VenueDeps } from "../../runtime";

export const RESERVE_WATCH_EVERY_MS = 5 * 60_000;

/** What a ticker's snapshot alerts on, in plain words; null when nothing does. */
export function reserveAlert(t: TickerReserve): string | null {
  const adapter = t.contracts.adapter?.toLowerCase();
  const others = (t.reads.issuers ?? []).filter((a) => a.toLowerCase() !== adapter);
  if (others.length) return `ISSUER_ROLE on b${t.ticker} is held by ${others.join(", ")} (only the adapter should)`;
  const failed = t.check.checks.filter((c) => c.status === "fail").map((c) => c.id);
  return failed.length ? `b${t.ticker} failed: ${failed.join(", ")}` : null;
}

export function startReserveWatch(deps: VenueDeps): { stop: () => void } {
  if (!deps.sql) throw new Error("reserve-watch needs DATABASE_URL");
  const network = deps.env.network;
  const store = createPgReserveStore(deps.sql);
  const tempo = createOpsClient({ network, rpcUrl: deps.env.tempoRpcUrl, tier: 2 }).public;
  const clients: BridgeClients = { network, tempo, ...sideClients(network, { robinhood: process.env.RH_RPC_HTTP_URL, base: process.env.BASE_SEPOLIA_RPC_HTTP_URL }) };

  const pass = async () => {
    const latest = await store.latest(network);
    const known: KnownIssuers = Object.fromEntries(latest.filter((r) => r.issuers && r.issuersToBlock !== null).map((r) => [r.ticker as BridgeTicker, { holders: r.issuers as `0x${string}`[], toBlock: r.issuersToBlock! }]));
    const view = await readReserves(clients, known, { fullIssuerScan: true });
    if (!view.ok) throw new Error(view.error.technical);
    if (view.stale) return { why: `reads failed; kept the last snapshot (${view.staleReason ?? "stale"})` };
    const v = view.value;
    const alerts: string[] = [];
    for (const t of v.tickers) {
      const alert = reserveAlert(t);
      if (alert) alerts.push(alert);
      const r = t.reads;
      await store.insert({
        network, ticker: t.ticker, atMs: v.atMs, tempoBlock: v.blocks.tempo, baseBlock: v.blocks.base, rhBlock: v.blocks.robinhood,
        lockedSD: r.lockbox?.locked ?? null, outstandingSD: r.lockbox?.outstanding ?? null, owedSD: r.lockbox?.owed ?? null, transitSD: r.transitSupply,
        supplySD: r.supply, deferredSD: r.deferred, mintedNetSD: r.mintedNet, supplyCapSD: r.supplyCap,
        issuers: r.issuers ? [...r.issuers] : null, issuersToBlock: r.issuers ? v.blocks.tempo : null,
        verdict: reserveVerdict([t.check]), checks: t.check.checks, alert,
      });
    }
    const verdict = reserveVerdict(v.tickers.map((t) => t.check));
    const rh = v.blocks.robinhood === null ? " · Robinhood side not deployed" : "";
    return {
      why: `${v.tickers.length} tickers ${verdict} at Tempo #${v.blocks.tempo}${rh}${alerts.length ? ` | ALERT ${alerts.join(" | ")}` : ""}`,
      detail: { verdict, blocks: { tempo: v.blocks.tempo.toString(), base: v.blocks.base?.toString() ?? null, robinhood: v.blocks.robinhood?.toString() ?? null }, alerts },
    };
  };
  return runActor({ name: "reserve-watch", log: deps.log, dryRun: false, everyMs: RESERVE_WATCH_EVERY_MS, pass, critical: false });
}
