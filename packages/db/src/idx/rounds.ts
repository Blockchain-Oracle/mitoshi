/**
 * The leaderboard's read (S5, L-48): one settled round per wallet and Window, from the index alone (Masayume 68f7a09
 * `readVenueBoard` replayed DreamDEX's fill tape for a day; our index holds every Window, so a period is a filter).
 * Who counts follows `/stats` (D-215): never the house or the maker vault; a Trading Balance's rounds are its owners',
 * from `idx_vault_executions`; a product contract's (Boost, Parlay, Range, the private desk) aren't ranked — the
 * private desk's on purpose (RV-86), the rest until those products are indexed by owner.
 *
 * A round's money, in pathUSD base units:
 * - stake: what was paid in — fills bought (`paid_ticklots` × cash unit) and sets minted (`set_paid_base`);
 * - proceeds: what came back before settlement — fills sold and sets merged;
 * - payout: the settlement rule on what was held when the Window settled, `held × payout / 10⁷` per lot's full
 *   payout (`lot_base`), redeemed or not yet (it equals the redemption on every redeemed position, checked live).
 * A vault owner's held tokens are the executions' `token_delta`, bought less sold, per outcome; a token base unit
 * pays `payout / 10⁷`. The outcome is `settleRound`'s: void; closed when nothing was held; a loss when nothing paid;
 * else a win when the net is not negative.
 */
import type postgres from "postgres";

type Sql = postgres.Sql;

const PAYOUT_DENOMINATOR = 10_000_000;

export interface RoundsQuery {
  house: readonly string[];
  vaults: readonly string[];
  products: readonly string[];
  /** Rounds whose Window settled at or after this second (a period); omit for all time. */
  sinceSec?: number;
  /** One wallet's rounds only (its profile, S5/S13); omit for every wallet. */
  owner?: string;
}

export interface RoundRow {
  owner: string;
  market: string;
  symbol: string;
  cadenceSec: number;
  stakeBase: bigint;
  proceedsBase: bigint;
  payoutBase: bigint;
  outcome: "win" | "loss" | "void" | "closed";
  settledSec: number;
}

export async function readSettledRounds(sql: Sql, q: RoundsQuery): Promise<RoundRow[]> {
  const excluded = [...q.house, ...q.vaults, ...q.products].map((a) => a.toLowerCase());
  const vaults = q.vaults.map((a) => a.toLowerCase());
  const since = q.sinceSec ?? 0;
  const owner = q.owner?.toLowerCase() ?? null;
  const rows = await sql`
    with settled as (
      select m.market, m.symbol, m.cadence_sec, m.state, m.payout_yes, m.payout_no, coalesce(m.resolved_ts_sec, m.expiry_sec) as settled_sec,
        coalesce(s.lot_base, 1000) as lot_base, coalesce(s.cash_unit, 1) as cash_unit
      from idx_markets m left join idx_series s on s.series = m.series
      where m.state <> 'open' and coalesce(m.resolved_ts_sec, m.expiry_sec) >= ${since}
    ),
    direct as (
      select p.owner, w.market, w.symbol, w.cadence_sec, w.state, w.settled_sec,
        p.paid_ticklots * w.cash_unit + p.set_paid_base as stake,
        p.received_ticklots * w.cash_unit + p.set_received_base as proceeds,
        p.bought_yes_lots - p.sold_yes_lots + p.minted_lots - p.merged_lots as held_yes,
        p.bought_no_lots - p.sold_no_lots + p.minted_lots - p.merged_lots as held_no,
        (p.bought_yes_lots - p.sold_yes_lots + p.minted_lots - p.merged_lots) * w.payout_yes * w.lot_base / ${PAYOUT_DENOMINATOR}
          + (p.bought_no_lots - p.sold_no_lots + p.minted_lots - p.merged_lots) * w.payout_no * w.lot_base / ${PAYOUT_DENOMINATOR} as payout
      from idx_positions p join settled w on w.market = p.market
      where p.owner <> all(${excluded}::text[]) and (p.paid_ticklots > 0 or p.set_paid_base > 0) ${owner ? sql`and p.owner = ${owner}` : sql``}
    ),
    taps as (
      select x.owner, w.market, w.symbol, w.cadence_sec, w.state, w.settled_sec,
        coalesce(sum(x.cash_delta) filter (where x.is_buy), 0) as stake,
        coalesce(sum(x.cash_delta) filter (where not x.is_buy), 0) as proceeds,
        coalesce(sum(case when x.is_buy then x.token_delta else -x.token_delta end) filter (where x.outcome_idx = 0), 0) as held_yes,
        coalesce(sum(case when x.is_buy then x.token_delta else -x.token_delta end) filter (where x.outcome_idx = 1), 0) as held_no,
        max(w.payout_yes) as payout_yes, max(w.payout_no) as payout_no
      from idx_vault_executions x join settled w on w.market = x.market
      where x.vault = any(${vaults}::text[]) and x.owner <> all(${excluded}::text[]) ${owner ? sql`and x.owner = ${owner}` : sql``}
      group by x.owner, w.market, w.symbol, w.cadence_sec, w.state, w.settled_sec
    ),
    rounds as (
      select 0 as src, owner, market, symbol, cadence_sec, state, settled_sec, stake, proceeds, held_yes, held_no, payout from direct
      union all
      select 1, owner, market, symbol, cadence_sec, state, settled_sec, stake, proceeds, held_yes, held_no,
        (held_yes * payout_yes + held_no * payout_no) / ${PAYOUT_DENOMINATOR} from taps where stake > 0
    )
    select owner, market, symbol, cadence_sec, settled_sec::text, floor(stake)::text as stake, floor(proceeds)::text as proceeds, floor(payout)::text as payout,
      case when state = 'voided' then 'void' when held_yes + held_no <= 0 then 'closed' when payout <= 0 then 'loss'
        when proceeds + payout >= stake then 'win' else 'loss' end as outcome
    from rounds order by settled_sec, market, owner, src`;
  return rows.map((r) => ({
    owner: String(r.owner),
    market: String(r.market),
    symbol: String(r.symbol),
    cadenceSec: Number(r.cadence_sec),
    stakeBase: BigInt(String(r.stake)),
    proceedsBase: BigInt(String(r.proceeds)),
    payoutBase: BigInt(String(r.payout)),
    outcome: r.outcome as RoundRow["outcome"],
    settledSec: Number(r.settled_sec),
  }));
}
