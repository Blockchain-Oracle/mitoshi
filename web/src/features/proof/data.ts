import "server-only";
/**
 * The proof page's data (S5): the Window and its prints from the indexer (`idxReader.markets` / `.prints`), the feed
 * its policy reads (TICKERS: a 24/7 stock lane reads the `---24_7` feed), and the verifier to ask (the generated
 * deployments of the configured network — never a hard-coded chain, R4-10). Read per request (the caller awaits
 * `connection()`); null when the index can't be read. `settledProofs` is the `/proof` feed: the newest settled Windows.
 */
import { indexReader } from "@cwf/db/idx";
import { deployments } from "@cwf/clients";
import { NETWORKS, TICKERS, type TickerSymbol } from "@cwf/core";
import { webEnv } from "@/lib/env";
import { db } from "@/server/db";

export interface ProofPrint {
  which: number;
  priceE8: string;
  sourceTsSec: number;
  signers: number;
  copied: boolean;
  recordedTsSec: number;
  txHash: `0x${string}` | null;
}

export interface ProofWindow {
  market: `0x${string}`;
  symbol: string;
  cadenceSec: number;
  basis: number;
  tradingStartSec: number;
  expirySec: number;
  state: string;
  winner: number | null;
  openedTx: `0x${string}` | null;
  resolvedTx: `0x${string}` | null;
  /** When the settlement landed (its block time); null until it did. */
  resolvedTsSec: number | null;
  feed: string | null;
  verifier: `0x${string}` | null;
  prints: ProofPrint[];
}

const STOCK24 = 2;

export async function readProof(market: `0x${string}`): Promise<ProofWindow | "unknown" | null> {
  try {
    const r = indexReader(db());
    const [m] = await r.markets({ market, limit: 1 });
    if (!m) return "unknown";
    const prints = await r.prints(market);
    const symbol = String(m.symbol);
    const ticker = (TICKERS as Record<string, { kind: string; redstoneFeedId: string | null; redstone24x7FeedId: string | null }>)[symbol as TickerSymbol];
    const basis = Number(m.basis);
    const feed = ticker ? (basis === STOCK24 && ticker.kind === "stock" ? ticker.redstone24x7FeedId : ticker.redstoneFeedId) : null;
    const engine = (deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>)[String(NETWORKS[webEnv.markets.network])]?.engine;
    return {
      market,
      symbol,
      cadenceSec: Number(m.cadence_sec),
      basis,
      tradingStartSec: Number(m.trading_start_sec),
      expirySec: Number(m.expiry_sec),
      state: String(m.state),
      winner: m.winner === null || m.winner === undefined ? null : Number(m.winner),
      openedTx: (m.opened_tx as `0x${string}` | null) ?? null,
      resolvedTx: (m.resolved_tx as `0x${string}` | null) ?? null,
      resolvedTsSec: m.resolved_ts_sec === null || m.resolved_ts_sec === undefined ? null : Number(m.resolved_ts_sec),
      feed,
      verifier: (engine?.contracts.RedStonePrintVerifier?.address as `0x${string}` | undefined) ?? null,
      prints: prints.map((p) => ({
        which: Number(p.which),
        priceE8: String(p.price_e8),
        sourceTsSec: Number(p.source_ts_sec),
        signers: Number(p.signers),
        copied: Boolean(p.copied),
        recordedTsSec: Number(p.recorded_ts_sec),
        txHash: (p.tx_hash as `0x${string}` | null) ?? null,
      })),
    };
  } catch {
    return null;
  }
}

export interface ProofFeedRow {
  market: `0x${string}`;
  symbol: string;
  cadenceSec: number;
  basis: number;
  expirySec: number;
  state: string;
  winner: number | null;
  openE8: string | null;
  closeE8: string | null;
}

/** The newest settled Windows with their two prints (the `/proof` feed); null when the index can't be read. */
export async function settledProofs(limit = 40): Promise<ProofFeedRow[] | null> {
  try {
    const rows = await indexReader(db()).markets({ settled: true, limit });
    return rows.map((m) => {
      const prints = (m.prints ?? {}) as Record<string, { priceE8?: string } | undefined>;
      return {
        market: String(m.market) as `0x${string}`,
        symbol: String(m.symbol),
        cadenceSec: Number(m.cadence_sec),
        basis: Number(m.basis),
        expirySec: Number(m.expiry_sec),
        state: String(m.state),
        winner: m.winner === null || m.winner === undefined ? null : Number(m.winner),
        openE8: prints["0"]?.priceE8 ?? null,
        closeE8: prints["1"]?.priceE8 ?? null,
      };
    });
  } catch {
    return null;
  }
}
