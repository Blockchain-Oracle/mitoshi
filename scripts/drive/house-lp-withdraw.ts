/**
 * D-231 ship step (owner): the house withdraws its 28 bid-ladder positions from the retired guarded stock pools —
 * tokenIds 6–33, seven per pool for TSLA, AMZN, PLTR and AMD (NFLX was never initialized) — from the Moderato v4
 * PositionManager, one transaction per pool: `modifyLiquidities([DECREASE_LIQUIDITY × 7 (each position's whole
 * liquidity, read now), BURN_POSITION × 7, TAKE_PAIR(pathUSD, mirror → the house)])`. The guard hook has no liquidity
 * callbacks, so nothing blocks it; the mirror side is 0 (only pathUSD comes back, ~$20k a pool, ~$80k in all) and no
 * swap can move these pools (the hook reverts every one), so the minimums are 0. The positions are read from the
 * retired fragment (`contracts/deployments/retired/42431/pools.json`).
 *
 *   tsx scripts/drive/house-lp-withdraw.ts           read each position and simulate each pool's withdrawal from the house
 *   tsx scripts/drive/house-lp-withdraw.ts --print   also print each transaction's target and calldata
 *   tsx scripts/drive/house-lp-withdraw.ts --send    send them with the house key (`deployer-products`) — owner only
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeAbiParameters, formatUnits, getAddress, parseAbi, parseAbiParameters, type Address, type Hex } from "viem";
import { tempoReadClient } from "@cwf/markets";
import { Action, actionsAndParams, decreaseLiquidity, modifyLiquidities, takePair } from "@cwf/markets/v4";
import { castBatch } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const POSITION_MANAGER: Address = "0x3fc79444f8eacc1894775493ff3fa41f1e35ce11";
const PM = parseAbi(["function getPositionLiquidity(uint256 tokenId) view returns (uint128)", "function ownerOf(uint256 tokenId) view returns (address)", "function modifyLiquidities(bytes unlockData, uint256 deadline)"]);
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const BURN = parseAbiParameters("uint256 tokenId, uint128 amount0Min, uint128 amount1Min, bytes hookData");

interface Pool { ticker: string; status: string; poolKey: { currency0: Address; currency1: Address }; positions?: { tokenId: string }[] }
const fragment = JSON.parse(readFileSync(join(import.meta.dirname, "../../contracts/deployments/retired/42431/pools.json"), "utf8")) as { house: Address; pools: Record<string, Pool> };
const house = getAddress(fragment.house);
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);
if (argv.includes("--send") && getAddress(loadRole("deployer-products").address) !== house) throw new Error("the deployer-products key is not the house");
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3_600);
const pathUsd = (await client.readContract({ address: "0x20C0000000000000000000000000000000000000", abi: ERC20, functionName: "balanceOf", args: [house] })) as bigint;
console.log(`house ${house} · pathUSD ${formatUnits(pathUsd, 6)} · PositionManager ${POSITION_MANAGER}`);

for (const pool of Object.values(fragment.pools).filter((p) => p.status === "initialized" && p.positions?.length)) {
  const ids = pool.positions!.map((p) => BigInt(p.tokenId));
  const reads = (await client.multicall({ allowFailure: true, contracts: ids.flatMap((id) => [{ address: POSITION_MANAGER, abi: PM, functionName: "ownerOf" as const, args: [id] as const }, { address: POSITION_MANAGER, abi: PM, functionName: "getPositionLiquidity" as const, args: [id] as const }]) })) as { status: string; result?: unknown }[];
  const live = ids.flatMap((id, i) => {
    const owner = reads[2 * i]!;
    const liquidity = reads[2 * i + 1]!;
    return owner.status === "success" && getAddress(owner.result as Address) === house ? [{ id, liquidity: liquidity.result as bigint }] : [];
  });
  if (live.length === 0) {
    console.log(`${pool.ticker}: nothing left (burned or not the house's)`);
    continue;
  }
  const steps: [number, Hex][] = [
    ...live.filter((p) => p.liquidity > 0n).map((p) => [Action.DECREASE_LIQUIDITY, decreaseLiquidity({ tokenId: p.id, liquidity: p.liquidity, amount0Min: 0n, amount1Min: 0n })] as [number, Hex]),
    ...live.map((p) => [Action.BURN_POSITION, encodeAbiParameters(BURN, [p.id, 0n, 0n, "0x"])] as [number, Hex]),
    [Action.TAKE_PAIR, takePair(pool.poolKey.currency0, pool.poolKey.currency1, house)],
  ];
  const data = modifyLiquidities(actionsAndParams(steps), deadline);
  const gas = await client.estimateGas({ account: house, to: POSITION_MANAGER, data });
  console.log(`${pool.ticker}: tokenIds ${live.map((p) => p.id).join(", ")} · liquidity ${live.map((p) => p.liquidity).join(", ")} · simulated from the house ok · gas ≈ ${gas}`);
  if (argv.includes("--print")) console.log(`  to ${POSITION_MANAGER}\n  data ${data}`);
  if (!argv.includes("--send")) continue;
  const r = castBatch([{ to: POSITION_MANAGER, data }], { signer: { role: "deployer-products" } });
  console.log(`  sent ${r.transactionHash} block ${BigInt(r.blockNumber)} status ${r.status}`);
  if (r.status !== "0x1") throw new Error(`${pool.ticker}: withdrawal reverted`);
}
process.exit(0);
