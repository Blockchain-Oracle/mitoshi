/**
 * S17a live drive (plan B.5.1 sub-gate): launch a stablecoin on Moderato in ONE Tempo transaction built by
 * `@cwf/markets` `buildStablecoinBatch`, then prove it: token at the predicted address, pair + both flip orders on the
 * enshrined DEX, FeeAMM reserves > 0, registry entry, and a follow-up tx that pays its fee in the new coin.
 *
 *   tsx scripts/drive/launch-stablecoin.ts [--fixture]                          # root key: the deployer role
 *   tsx scripts/drive/launch-stablecoin.ts --access-key <cast-wallet.json> --root <address>   # spike X22 variant
 *
 * `--fixture` writes the receipt to `packages/markets/src/launch/stablecoin.receipt.json` for the receipt-reader test.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, type PublicClient, createPublicClient, encodeFunctionData, erc20Abi, getAddress, http } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { buildStablecoinBatch, randomSalt, readStablecoinLaunch, readStablecoinReceipt } from "@cwf/markets/launch";
import { PATH_USD, type Signer, castBatch, castSend } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const arg = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const keyFile = arg("--access-key");
const root = arg("--root") as Address | undefined;
const signer: Signer = keyFile && root ? { accessKeyFile: keyFile, root } : { role: "deployer" };
const creator = getAddress("root" in signer ? signer.root : loadRole("deployer").address);

const client = createPublicClient({ chain: tempoModerato, transport: http(process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz") });
const registry = getAddress(deployments[42431].launch.contracts.LaunchRegistry.address);
const salt = randomSalt();
const tag = "root" in signer ? "Key" : "Root";
const input = {
  name: `Mitoshi ${tag} Test Dollar`,
  symbol: `MT${tag.toUpperCase()}USD`,
  currency: "USD",
  logoURI: "",
  metadataURI: "https://testnet.mitoshi.xyz/launch/stablecoin",
  supplyCap: 1_000_000_000_000n,
  initialSupply: 10_000_000_000n,
  bidAmount: 100_000_000n,
  askAmount: 100_000_000n,
  bidTick: -10,
  askTick: 10,
  feeLiquidity: 1_000_000_000n,
};

const batch = buildStablecoinBatch({ ...input, creator, salt, registry });
console.log(`creator ${creator} (${"root" in signer ? `access key for root` : "root key"}), salt ${salt}`);
console.log(`predicted token ${batch.token}; ${batch.calls.length} calls: ${batch.calls.map((c) => c.step).join(" → ")}`);

const pathBefore = await client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [creator] });
const r = castBatch(batch.calls, { signer });
const receipt = { status: r.status === "0x1" ? ("success" as const) : ("reverted" as const), logs: r.logs };
console.log(`launch tx ${r.transactionHash} block ${BigInt(r.blockNumber)} status ${r.status} gas ${BigInt(r.gasUsed)}`);
const progress = readStablecoinReceipt(batch, receipt);
for (const s of progress) console.log(`  ${s.done ? "✓" : "✗"} ${s.step}`);
if (receipt.status !== "success" || progress.some((s) => !s.done)) throw new Error("launch batch failed");

// Evidence, read back from chain.
const token = batch.token;
const orderIds = progress.filter((s) => s.step === "bid" || s.step === "ask").map((s) => s.args!.orderId as bigint);
const state = await readStablecoinLaunch(client as PublicClient, { token, registry, orderIds });
const pathAfter = await client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [creator] });
console.log(`token ${token}: isTIP20 ${state.isTIP20}, currency ${state.currency}, quote ${state.quoteToken}, supply ${state.totalSupply}`);
for (const o of state.orders) console.log(`  order ${o.orderId}: ${o.isBid ? "bid" : "ask"} tick ${o.tick} → flip ${o.flipTick}, remaining ${o.remaining}, maker ${o.maker}, flip ${o.isFlip}`);
console.log(`FeeAMM (${token} → pathUSD): reserveUser ${state.feePool.reserveUserToken}, reserveValidator ${state.feePool.reserveValidatorToken}`);
console.log(`registry launchOf: kind ${state.registry.kind} creator ${state.registry.creator} index ${state.registry.index}; creator pathUSD −${pathBefore - pathAfter} (bid escrow + FeeAMM + fee)`);
if (!state.isTIP20 || state.currency !== "USD" || state.quoteToken !== PATH_USD || state.feePool.reserveValidatorToken === 0n || state.registry.kind !== 1 || state.orders.length !== 2) throw new Error("launch evidence check failed");

// A transaction whose fee is paid in the new coin (FeeAMM swaps it to the validator's token).
const payTx = castSend([token, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [creator, 1n] })], { signer, feeToken: token });
const poolAfter = (await readStablecoinLaunch(client as PublicClient, { token, registry, orderIds: [] })).feePool;
const pool = state.feePool;
console.log(`fee-in-new-coin tx ${payTx.transactionHash} block ${BigInt(payTx.blockNumber)} status ${payTx.status} feeToken ${payTx.feeToken}`);
console.log(`FeeAMM after: reserveUser ${pool.reserveUserToken} → ${poolAfter.reserveUserToken}, reserveValidator ${pool.reserveValidatorToken} → ${poolAfter.reserveValidatorToken}`);
if (payTx.status !== "0x1" || getAddress(payTx.feeToken ?? PATH_USD) !== token) throw new Error("fee payment in the new coin failed");

if (argv.includes("--fixture")) {
  const out = join(import.meta.dirname, "..", "..", "packages", "markets", "src", "launch", "stablecoin.receipt.json");
  const fixture = { note: `Moderato launch tx ${r.transactionHash} (scripts/drive/launch-stablecoin.ts)`, input: { salt, creator, registry, name: input.name, symbol: input.symbol, metadataURI: input.metadataURI, logoURI: input.logoURI }, receipt: { status: receipt.status, logs: r.logs.map(({ address, topics, data }) => ({ address, topics, data })) } };
  writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote ${out}`);
}
console.log("sub-gate: pass");
