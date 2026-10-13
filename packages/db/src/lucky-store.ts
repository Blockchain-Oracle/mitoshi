/**
 * Lucky draws over Postgres (`lucky_draws`, migrations/games/0001_games.sql) — ported from Masayume 68f7a09
 * packages/db/src/games.ts (`createLuckyDraw`, `getLuckyDraw`, `revealLuckyDraw`, the history read) for R4-9 (D-227).
 *
 * A row is one draw from its commitment to what the chain decided. The server seed is written at commit, before the
 * browser's seed exists; the deal's fields fill in at reveal; the placement at placed. Money is decimal strings in base
 * units. Wallets are lowercased at the write and only there.
 */
import type { Sql } from "./index";

export type LuckyRowResult = "drawn" | "placed" | "pending" | "won" | "lost" | "void" | "cashed-out" | "refused" | "unknown";

export interface LuckyDrawRow {
  drawId: string;
  wallet: string;
  nonce: number;
  policyVersion: number;
  stakeBase: string;
  commitment: string;
  serverSeed: string;
  clientSeed: string | null;
  asset: string | null;
  side: "up" | "down" | null;
  multiplier: number | null;
  candidateHash: string | null;
  marketId: string | null;
  quoteAvgPriceBps: number | null;
  txHash: string | null;
  costBase: string | null;
  quantityRaw: string | null;
  result: LuckyRowResult;
  refusal: string | null;
  createdAt: string;
  placedAt: string | null;
}

export interface LuckyStore {
  /** The next nonce is one past the wallet's last; the unique (wallet, nonce) key settles a race. */
  create(input: { drawId: string; wallet: string; policyVersion: number; stakeBase: string; commitment: string; serverSeed: string }): Promise<LuckyDrawRow>;
  get(drawId: string): Promise<LuckyDrawRow | null>;
  reveal(drawId: string, deal: { clientSeed: string; asset: string; side: "up" | "down"; multiplier: number; candidateHash: string; marketId: string | null; quoteAvgPriceBps: number | null; quoteContractsRaw: string | null; result: "drawn" | "refused"; refusal: string | null }): Promise<void>;
  /** Only a dealt draw moves to placed (or refused), once. */
  placed(drawId: string, wallet: string, outcome: { result: "placed" | "refused" | "unknown"; txHash: string | null; costBase: string | null; quantityRaw: string | null; refusal: string | null }): Promise<boolean>;
  history(wallet: string, limit: number): Promise<LuckyDrawRow[]>;
  /** A placed row's verdict, once the chain decided it: won, lost, void or cashed out. Only an open row moves. */
  settle(drawId: string, result: "won" | "lost" | "void" | "cashed-out"): Promise<void>;
  /** Every wallet's verified rows (won, lost, void), newest first — the streak board's input. */
  verified(limit: number): Promise<{ wallet: string; result: LuckyRowResult }[]>;
}

type Db = {
  draw_id: string; wallet: string; nonce: number; policy_version: number; stake_base: string; commitment: string; server_seed: string; client_seed: string | null;
  asset: string | null; side: "up" | "down" | null; multiplier: number | null; candidate_hash: string | null; market_id: string | null; quote_avg_price_bps: number | null;
  tx_hash: string | null; cost_base: string | null; quantity_raw: string | null; result: LuckyRowResult; refusal: string | null; created_at: Date; placed_at: Date | null;
};

const row = (r: Db): LuckyDrawRow => ({
  drawId: r.draw_id, wallet: r.wallet, nonce: r.nonce, policyVersion: r.policy_version, stakeBase: r.stake_base, commitment: r.commitment, serverSeed: r.server_seed,
  clientSeed: r.client_seed, asset: r.asset, side: r.side, multiplier: r.multiplier, candidateHash: r.candidate_hash, marketId: r.market_id, quoteAvgPriceBps: r.quote_avg_price_bps,
  txHash: r.tx_hash, costBase: r.cost_base, quantityRaw: r.quantity_raw, result: r.result, refusal: r.refusal, createdAt: r.created_at.toISOString(), placedAt: r.placed_at?.toISOString() ?? null,
});

export function createPgLuckyStore(sql: Sql): LuckyStore {
  return {
    async create(input) {
      const wallet = input.wallet.toLowerCase();
      const rows = await sql<Db[]>`
        insert into lucky_draws (draw_id, wallet, nonce, policy_version, stake_base, commitment, server_seed, result)
        values (${input.drawId}, ${wallet}, (select coalesce(max(nonce), 0) + 1 from lucky_draws where wallet = ${wallet}),
                ${input.policyVersion}, ${input.stakeBase}, ${input.commitment}, ${input.serverSeed}, 'drawn')
        returning *`;
      return row(rows[0]!);
    },
    async get(drawId) {
      const rows = await sql<Db[]>`select * from lucky_draws where draw_id = ${drawId}`;
      return rows[0] ? row(rows[0]) : null;
    },
    async reveal(drawId, d) {
      await sql`
        update lucky_draws set client_seed = ${d.clientSeed.toLowerCase()}, asset = ${d.asset}, side = ${d.side}, multiplier = ${d.multiplier},
          candidate_hash = ${d.candidateHash}, market_id = ${d.marketId}, quote_avg_price_bps = ${d.quoteAvgPriceBps}, quote_contracts_raw = ${d.quoteContractsRaw},
          result = ${d.result}, refusal = ${d.refusal}, revealed_at = now()
        where draw_id = ${drawId} and client_seed is null`;
    },
    async placed(drawId, wallet, o) {
      const rows = await sql<{ draw_id: string }[]>`
        update lucky_draws set result = ${o.result}, tx_hash = ${o.txHash}, cost_base = ${o.costBase}, quantity_raw = ${o.quantityRaw}, refusal = ${o.refusal}, placed_at = now()
        where draw_id = ${drawId} and wallet = ${wallet.toLowerCase()} and result = 'drawn' and market_id is not null
        returning draw_id`;
      return rows.length > 0;
    },
    async settle(drawId, result) {
      await sql`update lucky_draws set result = ${result}, settled_at = now() where draw_id = ${drawId} and result in ('placed', 'pending', 'unknown')`;
    },
    async verified(limit) {
      return sql<{ wallet: string; result: LuckyRowResult }[]>`
        select wallet, result from lucky_draws where result in ('won', 'lost', 'void') order by created_at desc limit ${limit}`;
    },
    async history(wallet, limit) {
      const rows = await sql<Db[]>`select * from lucky_draws where wallet = ${wallet.toLowerCase()} and client_seed is not null order by created_at desc limit ${limit}`;
      return rows.map(row);
    },
  };
}
