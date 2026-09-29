/**
 * Writes `packages/markets/src/v4/encode.vectors.json` (plan S15a):
 *  - `mainnet`: real UniversalRouter `0xa2dc` calls from Tempo mainnet (each tx has a successful receipt with ≥ 1 v4
 *    Swap), with the router calldata as sent and the swap's fields decoded in the frozen layout. `encode.test.ts`
 *    rebuilds each V4_SWAP input — and, for plain `execute(0x10, …, deadlineSec)` calls, the whole calldata — from the
 *    fields alone and must match byte-for-byte.
 *  - `probe`: calldata produced by `encode.ts` itself that `UrAbiProbe.fork.t.sol` executes against live pools on a
 *    mainnet fork (the multi-hop layout has no recent 0xa2dc sample on chain, so it is proven by execution).
 *
 *   tsx scripts/v4/golden-vectors.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, type Hex, decodeAbiParameters, decodeFunctionData, keccak256, parseAbiParameters, toHex } from "viem";
import { ROUTER_ABI, poolKey, swapExactIn, swapExactInSingle } from "@cwf/markets/v4";
import { mainnet, same } from "./lib";

const UR: Address = "0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91";
const SWAP_TOPIC = keccak256(toHex("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"));
/** Chosen to span tx types (legacy, EIP-1559, Tempo 0x76), TAKE vs TAKE_ALL, TIP-20 and 18-dec ERC-20 pools, and a
 *  PERMIT2_PERMIT_BATCH + V4_SWAP command pair. Found by scanning PoolManager Swap logs (blocks 41.1M–41.7M). */
const TXS: Hex[] = [
  "0x2af8efcfcf249fad97916c3a1fc5947525df3ea4e6031ff14e9bc48a3b96fd1a",
  "0x005f483a4a012dbee89341dc4e8fb05362b1d0c21e42b61af7c9c77a03e2eb8c",
  "0xc5d439f832a7f9b82ab74a4a3a9e2b69b4dba65f9590f2293868c641b57bdaf3",
  "0xedefd988de6ae1a8f9dcdf63754c109549b323b81c8148e4b83a62269fd02350",
  "0x011bcfc6eb70c05aa4dde8a1b6033860559e75b8b204f7c31099238a9c6982f1",
  "0xcdb7be59954fedd8520ea8e5a11869632fa042383ac9f0d15377f47262c290c3",
];
const KEY = "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
const SINGLE = parseAbiParameters(`(${KEY} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)`);
const s = (v: unknown): unknown => (typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(s) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, s(x)])) : v);

const mainnetVectors = [];
for (const hash of TXS) {
  const [tx, receipt] = await Promise.all([mainnet.getTransaction({ hash }), mainnet.getTransactionReceipt({ hash })]);
  if (receipt.status !== "success") throw new Error(`${hash}: receipt not successful`);
  const swaps = receipt.logs.filter((l) => l.topics[0] === SWAP_TOPIC).length;
  if (swaps < 1) throw new Error(`${hash}: no v4 Swap`);
  const calls = (tx as unknown as { calls?: { to: Address; input?: Hex; data?: Hex }[] }).calls;
  const call = calls?.length ? calls.map((c) => ({ to: c.to, input: (c.input ?? c.data)! })).find((c) => same(c.to, UR)) : { to: tx.to!, input: tx.input };
  if (!call || !same(call.to, UR)) throw new Error(`${hash}: not a 0xa2dc call`);
  const d = decodeFunctionData({ abi: ROUTER_ABI, data: call.input as Hex });
  const commands = d.args[0] as Hex;
  const inputs = d.args[1] as readonly Hex[];
  const idx = (commands.slice(2).match(/../g) ?? ([] as string[])).indexOf("10");
  const v4SwapInput = inputs[idx]!;
  const [actions, params] = decodeAbiParameters(parseAbiParameters("bytes actions, bytes[] params"), v4SwapInput);
  const [swap] = decodeAbiParameters(SINGLE, params[0]!);
  const settleTake = params.slice(1).map((p, i) => {
    const action = Number.parseInt(actions.slice(4 + 2 * i, 6 + 2 * i), 16);
    const abi = action === 0x0e ? "address currency, address recipient, uint256 amount" : "address currency, uint256 amount";
    return { action, fields: decodeAbiParameters(parseAbiParameters(abi), p) };
  });
  mainnetVectors.push(s({
    txHash: hash, block: receipt.blockNumber, txType: tx.type, gasUsed: receipt.gasUsed, v4Swaps: swaps,
    commands, deadlineSec: d.args.length === 3 ? d.args[2] : null, calldata: call.input, v4SwapInput, actions,
    swap, settleTake,
  }));
  console.log(`${hash} ${tx.type} commands ${commands} actions ${actions} swaps ${swaps}`);
}

// Probe vectors: made by encode.ts, executed by UrAbiProbe on a fork pinned at block 41,744,000.
const PATH_USD: Address = "0x20C0000000000000000000000000000000000000";
const USDC_E: Address = "0x20C000000000000000000000b9537d11c60E8b50";
const USDT0: Address = "0x20C00000000000000000000014f22CA97301EB73";
const AGG: Address = "0x7169a78a59f136876e724b648fbb339a42f46888";
const ZERO: Address = "0x0000000000000000000000000000000000000000";
const deadlineSec = 2n ** 40n;
const probe = {
  deadlineSec: deadlineSec.toString(),
  singleHookless: swapExactInSingle({ poolKey: poolKey(PATH_USD, USDC_E, 100, 1), zeroForOne: true, amountIn: 100_000_000n, amountOutMinimum: 99_000_000n, deadlineSec }),
  singleAggregatorHook: swapExactInSingle({ poolKey: poolKey(PATH_USD, USDC_E, 500, 10, AGG), zeroForOne: true, amountIn: 100_000_000n, amountOutMinimum: 99_000_000n, deadlineSec }),
  multiHopMaxPrice: swapExactIn({
    currencyIn: PATH_USD,
    path: [
      { intermediateCurrency: USDC_E, fee: 100, tickSpacing: 1, hooks: ZERO, hookData: "0x" },
      { intermediateCurrency: USDT0, fee: 100, tickSpacing: 1, hooks: ZERO, hookData: "0x" },
    ],
    maxHopPrice: [1_020_000_000_000_000_000n, 1_020_000_000_000_000_000n],
    amountIn: 100_000_000n,
    amountOutMinimum: 98_000_000n,
    deadlineSec,
  }),
};

const out = join(import.meta.dirname, "..", "..", "packages", "markets", "src", "v4", "encode.vectors.json");
const note = "Real 0xa2dc calldata from Tempo mainnet (mainnet[]) and encode.ts output executed on a mainnet fork (probe). Regenerate: tsx scripts/v4/golden-vectors.ts";
writeFileSync(out, `${JSON.stringify({ note, router: UR, mainnet: mainnetVectors, probe }, null, 2)}\n`);
console.log(`wrote ${out}`);
