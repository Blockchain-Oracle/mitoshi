// Trader Edge signed out (R6 money, T10 + S06; D-230): whose real report to show — a ranked wallet that isn't the
// house's, with a positive all-time P&L and the most settled Windows (ties: the higher P&L), at least five, so the
// report has a pattern to show. Pure; the server page reads the board and passes the pick.
export interface ExemplarRow {
  rank: number;
  owner: string;
  pnlBase: string;
  settledTrades: number;
}

export interface Exemplar {
  address: string;
  rank: number;
  settled: number;
  /** Wallets on the all-time board ("#11 / 161"). */
  of: number;
}

export const EXEMPLAR_MIN_SETTLED = 5;

export function pickExemplar(rows: readonly ExemplarRow[], house: ReadonlySet<string>, of: number): Exemplar | null {
  let best: ExemplarRow | null = null;
  for (const r of rows) {
    if (house.has(r.owner.toLowerCase()) || BigInt(r.pnlBase) <= 0n || r.settledTrades < EXEMPLAR_MIN_SETTLED) continue;
    if (!best || r.settledTrades > best.settledTrades || (r.settledTrades === best.settledTrades && BigInt(r.pnlBase) > BigInt(best.pnlBase))) best = r;
  }
  return best ? { address: best.owner, rank: best.rank, settled: best.settledTrades, of } : null;
}
