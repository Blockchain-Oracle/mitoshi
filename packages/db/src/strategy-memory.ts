// Ported from Agari 03b30ab:packages/db/src/strategy-memory.ts — a store over the caller's `sql`.
/**
 * Sealed memory (the Memory Market, L-56; migrations/strategies/0002): a creator's notes that only a subscriber may read.
 * This layer does not gate — the routes verify signatures and the chain — but it guarantees the index never carries a
 * body, so nothing that lists the market can leak one.
 */
import type { Sql } from "./index";

export interface SealedMemoryIndexRow {
  strategyId: string;
  creator: string;
  title: string;
  chars: number;
  updatedAtMs: number;
}

export function createPgSealedMemory(sql: Sql) {
  return {
    async upsert(strategyId: string, creator: string, title: string, body: string): Promise<void> {
      await sql`
        insert into strategy_sealed_memory (strategy_id, creator, title, body) values (${strategyId}, ${creator.toLowerCase()}, ${title}, ${body})
        on conflict (strategy_id) do update set creator = excluded.creator, title = excluded.title, body = excluded.body, updated_at = now()`;
    },
    /** Everything a visitor may know: that a memory exists, its title and its length. Never the body. */
    async index(): Promise<SealedMemoryIndexRow[]> {
      const rows = await sql<{ strategy_id: string; creator: string; title: string; chars: number; updated_at: Date }[]>`
        select strategy_id, creator, title, length(body)::int as chars, updated_at from strategy_sealed_memory`;
      return rows.map((r) => ({ strategyId: r.strategy_id, creator: r.creator, title: r.title, chars: r.chars, updatedAtMs: r.updated_at.getTime() }));
    },
    /** The body itself — only the gated route calls this, after it has verified who is asking. */
    async read(strategyId: string): Promise<{ creator: string; title: string; body: string; updatedAtMs: number } | null> {
      const [r] = await sql<{ creator: string; title: string; body: string; updated_at: Date }[]>`select creator, title, body, updated_at from strategy_sealed_memory where strategy_id = ${strategyId}`;
      return r ? { creator: r.creator, title: r.title, body: r.body, updatedAtMs: r.updated_at.getTime() } : null;
    },
  };
}

export type SealedMemoryStore = ReturnType<typeof createPgSealedMemory>;
