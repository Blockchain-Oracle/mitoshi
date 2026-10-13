/**
 * A theme's drift and rebalance plan (S16a; R4-11, D-227; plan B.4.4), in integers: what a follower holds of each token
 * at its reference price, each weight against the theme's band, and the legs that bring every out-of-band token back to
 * its target — buys paid from cash, sells into cash — each capped by the follow's per-trade cap, with the follower's
 * floor at `maxSlippageBps` under the reference. The key's daily limits for a follow come from here too
 * (`ceil(maxDailyUsd / P × 1.2)` per token, B.4.3). Every token and pathUSD is a 6-decimal TIP-20; prices are 1e18 USD.
 */
const E18 = 10n ** 18n;
const BPS = 10_000n;

export interface DriftBand { minBps: number; targetBps: number; maxBps: number; allowed: boolean }
export interface DriftMember { token: string; balance: bigint; priceE18: bigint | null; band: DriftBand }
export interface DriftRow { token: string; valueUsd: bigint; weightBps: number; driftBps: number; out: "under" | "over" | null }
export interface ThemeDrift { totalUsd: bigint; cashUsd: bigint; cashBps: number; rows: DriftRow[]; priced: boolean }
export interface PlannedLeg { tokenIn: string; tokenOut: string; amountIn: bigint; minAmountOut: bigint }

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** The key's daily limit on one token: the follow's daily USD at that price, 20 % over (B.4.3). 0 without a price. */
export function tokenDailyLimit(maxDailyUsd: bigint, priceE18: bigint | null): bigint {
  return priceE18 === null || priceE18 <= 0n ? 0n : ceilDiv(maxDailyUsd * E18 * 12n, priceE18 * 10n);
}

/** Headroom on the key's pathUSD limit for the network fees its own transactions pay (fractions of a cent each). */
export const NETWORK_FEE_HEADROOM_USD = 1_000_000n;

/** The key's daily pathUSD limit: the daily cap, the creator's fee on it (buys approve amount + fee, D-101) and fees. */
export function pathUsdDailyLimit(maxDailyUsd: bigint, creatorFeeBps: number): bigint {
  return maxDailyUsd + ceilDiv(maxDailyUsd * BigInt(creatorFeeBps), BPS) + NETWORK_FEE_HEADROOM_USD;
}

/** Weights in bps of (Σ token value + cash, capped at the allocation); unpriced members make the drift unpriced. */
export function themeDrift(members: readonly DriftMember[], cashBalance: bigint, allocationUsd: bigint): ThemeDrift {
  const priced = members.every((m) => m.priceE18 !== null && m.priceE18 > 0n);
  const values = members.map((m) => (m.priceE18 ? (m.balance * m.priceE18) / E18 : 0n));
  const invested = values.reduce((a, b) => a + b, 0n);
  const room = allocationUsd > invested ? allocationUsd - invested : 0n;
  const cashUsd = cashBalance < room ? cashBalance : room;
  const totalUsd = invested + cashUsd;
  const bps = (v: bigint) => (totalUsd === 0n ? 0 : Number((v * BPS) / totalUsd));
  const rows = members.map((m, i): DriftRow => {
    const weightBps = bps(values[i]!);
    return { token: m.token, valueUsd: values[i]!, weightBps, driftBps: weightBps - m.band.targetBps, out: weightBps < m.band.minBps ? "under" : weightBps > m.band.maxBps ? "over" : null };
  });
  return { totalUsd, cashUsd, cashBps: bps(cashUsd), rows, priced };
}

/**
 * The legs that bring every out-of-band token back to its target: sells first (they fund the buys), then buys while
 * cash lasts, each capped at `maxTradeUsd`, never a buy of a token the band forbids. Nothing when the drift is unpriced.
 */
export function planRebalance(members: readonly DriftMember[], drift: ThemeDrift, opts: { pathUsd: string; maxTradeUsd: bigint; maxSlippageBps: number; dailyLeftUsd?: bigint }): PlannedLeg[] {
  if (!drift.priced || drift.totalUsd === 0n) return [];
  const floor = (v: bigint) => (v * (BPS - BigInt(opts.maxSlippageBps))) / BPS;
  // Each leg within the per-trade cap and, together, within what the follow's day has left (the router's DailyCap).
  let left = opts.dailyLeftUsd ?? -1n;
  const cap = (v: bigint) => {
    let usd = v > opts.maxTradeUsd ? opts.maxTradeUsd : v;
    if (left >= 0n) {
      if (usd > left) usd = left;
      left -= usd;
    }
    return usd;
  };
  const sells: PlannedLeg[] = [];
  const buys: PlannedLeg[] = [];
  let cash = drift.cashUsd;
  members.forEach((m, i) => {
    const row = drift.rows[i]!;
    const targetUsd = (drift.totalUsd * BigInt(m.band.targetBps)) / BPS;
    const price = m.priceE18!;
    if (row.out === "over") {
      const usd = cap(row.valueUsd - targetUsd);
      const coin = (usd * E18) / price;
      if (coin > 0n) {
        sells.push({ tokenIn: m.token, tokenOut: opts.pathUsd, amountIn: coin, minAmountOut: floor(usd) });
        cash += usd;
      }
    }
  });
  members.forEach((m, i) => {
    const row = drift.rows[i]!;
    if (row.out !== "under" || !m.band.allowed) return;
    const targetUsd = (drift.totalUsd * BigInt(m.band.targetBps)) / BPS;
    let usd = cap(targetUsd - row.valueUsd);
    if (usd > cash) usd = cash;
    if (usd <= 0n) return;
    buys.push({ tokenIn: opts.pathUsd, tokenOut: m.token, amountIn: usd, minAmountOut: floor((usd * E18) / m.priceE18!) });
    cash -= usd;
  });
  return [...sells, ...buys];
}
