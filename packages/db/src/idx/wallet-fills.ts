/**
 * A wallet's own calls as the index saw them (S13's notification centre): each fill where it took or made a side, and
 * each Trading Balance execution recorded for it as owner, newest first. Kinds are the engine's (0 BUY_YES, 1 SELL_YES,
 * 2 BUY_NO, 3 SELL_NO); a fill's price is the YES price in ticks of a 1,000-tick pair.
 */
import type { Sql } from "../index";

export interface WalletFill {
  txHash: string;
  logIndex: number;
  market: string;
  symbol: string;
  cadenceSec: number;
  kind: number;
  lots: string;
  priceTicks: number;
  tsSec: number;
  via: "wallet" | "vault";
}

export async function readWalletFills(sql: Sql, q: { address: string; sinceSec: number; limit?: number }): Promise<WalletFill[]> {
  const a = q.address.toLowerCase();
  const rows = await sql<{ tx_hash: string; log_index: number; market: string; symbol: string; cadence_sec: number; kind: number; lots: string; price_ticks: number; ts_sec: string; via: "wallet" | "vault" }[]>`
    select * from (
      select f.tx_hash, f.log_index, f.market, m.symbol, m.cadence_sec, case when f.taker = ${a} then f.taker_kind else f.maker_kind end as kind,
        f.lots::text, f.price_ticks, f.ts_sec::text, 'wallet' as via
      from idx_fills f join idx_markets m on m.market = f.market
      where (f.taker = ${a} or f.maker = ${a}) and f.ts_sec >= ${q.sinceSec}
      union all
      select x.tx_hash, x.log_index, x.market, m.symbol, m.cadence_sec,
        case when x.outcome_idx = 0 then (case when x.is_buy then 0 else 1 end) else (case when x.is_buy then 2 else 3 end) end,
        abs(x.token_delta)::text, 0, x.at_sec::text, 'vault'
      from idx_vault_executions x join idx_markets m on m.market = x.market
      where x.owner = ${a} and x.at_sec >= ${q.sinceSec}
    ) u order by ts_sec::bigint desc, log_index desc limit ${Math.min(200, q.limit ?? 50)}`;
  return rows.map((r) => ({ txHash: r.tx_hash, logIndex: r.log_index, market: r.market, symbol: r.symbol, cadenceSec: r.cadence_sec, kind: r.kind, lots: r.lots, priceTicks: r.price_ticks, tsSec: Number(r.ts_sec), via: r.via }));
}
