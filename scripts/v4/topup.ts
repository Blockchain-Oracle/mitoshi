/**
 * S15c daily house top-up for the guarded stock pools (plan B.3.4) — the step that runs once bridged inventory lands.
 *
 *   pnpm --dir scripts exec tsx v4/topup.ts [--dry] [TSLA AMZN …]      (HOUSE_ROLE=deployer-products by default)
 *
 * Per initialized pool in `deployments/42431/pools.json`, one house batch:
 *   pushRedStone(mirror, latest production-signed payload)
 *   approvals (pathUSD, mirror → Permit2 → PositionManager)
 *   PositionManager.multicall([modifyLiquidities(MINT_POSITION × k + SETTLE_PAIR)])
 * - pairs: the house's mirror balance above the 5 kept for bridge demos, until 30 per ticker are seeded, as 80 % ±12 %
 *   + 20 % full range with equal pathUSD at the pool's own price. Skipped (with the reason) while the pool trades more
 *   than the regular band away from the reference: arbitrage first, never seed at a stale price.
 * - ladder: when the pathUSD still resting in the bid ladder is under half of $20k, a fresh ladder for the difference
 *   over −1 %…−15 % of the current price.
 * Mirrors come only from the bridge (TIP20MintBurnAdapter on a Robinhood lock); nothing else mints them.
 */
import { execSync } from "node:child_process";
import { planHouse, type HousePosition } from "@cwf/core/stocks/housePlan";
import { amountsForLiquidity } from "@cwf/core/stocks/liquidity";
import { tokenPriceFromSqrt } from "@cwf/core/stocks/guard";
import { castBatch, loadRole, PATH_USD } from "./lib";
import {
  KEEP, LADDER_USD, SEED_MAX, TICKERS, balanceOf, feedOf, freshSpot, houseCalls, keyOf, mintedTokenIds, priceFromSpot,
  pushRedStoneCall, readPools, slot0, writePools, type Ticker,
} from "./stock-pools-lib";

const dry = process.argv.includes("--dry");
const wanted = (process.argv.slice(2).filter((a) => !a.startsWith("--")) as Ticker[]).filter((t) => TICKERS.includes(t));
const role = process.env.HOUSE_ROLE ?? "deployer-products";
const house = loadRole(role).address;
const commit = execSync("git rev-parse --short HEAD").toString().trim();
const file = readPools(house, commit);
const REGULAR_BAND_BPS = 150n;

for (const t of wanted.length ? wanted : [...TICKERS]) {
  const rec = file.pools[t];
  const key = keyOf(t);
  if (!rec || rec.status !== "initialized") {
    const feed = await feedOf(key.currency1);
    console.log(`${t}: not initialized${feed ? " — a feed is pinned now: run create-stock-pools.ts" : ` (${rec?.reason ?? "run create-stock-pools.ts"})`}`);
    continue;
  }
  const { sqrtPriceX96, tick } = await slot0(key);
  const spot = await freshSpot(await feedOf(key.currency1));
  const { price } = await priceFromSpot(key.currency1, spot.medianE8);
  const poolPrice = tokenPriceFromSqrt(sqrtPriceX96);
  const offBps = ((poolPrice > price ? poolPrice - price : price - poolPrice) * 10_000n) / price;

  const positions: HousePosition[] = [];
  const seeded = rec.positions.filter((p) => !p.label.startsWith("ladder")).reduce((s, p) => s + BigInt(p.amount1), 0n);
  const bal = await balanceOf(key.currency1, house);
  const room = SEED_MAX > seeded ? SEED_MAX - seeded : 0n;
  const avail = bal > KEEP ? bal - KEEP : 0n;
  const seed = avail < room ? avail : room;
  let note = `inventory ${bal} (seeded ${seeded}, adding ${seed})`;
  if (seed > 0n && offBps > REGULAR_BAND_BPS) note += ` — pairs skipped: pool ${offBps} bps from the reference`;
  else if (seed > 0n) positions.push(...planHouse({ sqrtPriceX96, tokenPriceE18: poolPrice, mirror: seed, ladderUsd: 0n }));

  const resting = rec.positions.filter((p) => p.label.startsWith("ladder")).reduce((s, p) => s + amountsForLiquidity(sqrtPriceX96, p.tickLower, p.tickUpper, BigInt(p.liquidity)).amount0, 0n);
  if (resting * 2n < LADDER_USD) positions.push(...planHouse({ sqrtPriceX96, tokenPriceE18: poolPrice, mirror: 0n, ladderUsd: LADDER_USD - resting }));
  note += `; ladder resting ${resting}${resting * 2n < LADDER_USD ? ` → +${LADDER_USD - resting}` : ""}`;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const { calls, need0, need1 } = houseCalls({ key, positions, owner: house, nowSec });
  const batch = [pushRedStoneCall(key.currency1, spot.payload), ...calls];
  console.log(`${t}: tick ${tick}, pool ${Number(poolPrice / 10n ** 12n) / 1e6} vs reference ${Number(price / 10n ** 12n) / 1e6} (${offBps} bps); ${note}; pathUSD ${need0}, mirror ${need1}; ${positions.length} new position(s)`);
  if (dry) continue;
  if (need0 > (await balanceOf(PATH_USD, house))) throw new Error(`${t}: not enough pathUSD for ${need0}`);
  const r = castBatch(batch, { signer: { role } });
  if (r.status !== "0x1") throw new Error(`${t}: top-up failed ${r.transactionHash}`);
  const ids = mintedTokenIds(r.logs, house);
  if (ids.length !== positions.length) throw new Error(`${t}: minted ${ids.length}, planned ${positions.length}`);
  rec.positions.push(...positions.map((p, i) => ({ tokenId: ids[i]!.toString(), label: p.label, tickLower: p.tickLower, tickUpper: p.tickUpper, liquidity: p.liquidity.toString(), amount0: p.amount0.toString(), amount1: p.amount1.toString(), tx: r.transactionHash })));
  console.log(`${t}: tx ${r.transactionHash} block ${BigInt(r.blockNumber)} gas ${BigInt(r.gasUsed)}${ids.length ? `; NFTs ${ids.join(",")}` : "; reference refreshed only"}`);
  writePools(file, commit);
}
