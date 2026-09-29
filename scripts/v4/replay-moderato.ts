/**
 * Replays the seven Uniswap v4 mainnet CREATE2 deployments onto Moderato at the same addresses (docs/specs/v4-replay.md,
 * plan D-021, spike X2). Root key only: access keys cannot CREATE.
 *
 *   tsx scripts/v4/replay-moderato.ts [--only 1,2] [--dry-run]
 *
 * For each row: fetch the mainnet tx input, require `to == Arachnid`, split salt ‖ initcode, require that the CREATE2
 * address (viem and `cast create2`) equals the expected one, skip when Moderato already has code there (never re-send),
 * `cast send` with gas 29.5M, fee token pathUSD, priority fee 1, then wait for a later block before the next row.
 * `TEMPO_RPC_HTTP_URL` points it elsewhere (e.g. an `anvil --network tempo` fork of Moderato from before the replay).
 */
import { execFileSync } from "node:child_process";
import { ARACHNID, ROWS, castSend, loadRole, mainnet, moderato, same, splitArachnid } from "./lib";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyArg = args[args.indexOf("--only") + 1];
const only = args.includes("--only") && onlyArg ? new Set(onlyArg.split(",").map(Number)) : null;

const account = loadRole("deployer");

for (const row of ROWS) {
  if (only && !only.has(row.n)) continue;
  const tx = await mainnet.getTransaction({ hash: row.mainnetTx });
  if (!tx.to || !same(tx.to, ARACHNID)) throw new Error(`row ${row.n}: mainnet tx is not to Arachnid (${tx.to})`);
  if (tx.blockNumber !== row.mainnetBlock) throw new Error(`row ${row.n}: mainnet block ${tx.blockNumber} ≠ ${row.mainnetBlock}`);
  const { salt, initCode, predicted } = splitArachnid(tx.input);
  const castAddr = execFileSync("cast", ["create2", "--deployer", ARACHNID, "--salt", salt, "--init-code", initCode]).toString().trim().split(/\s+/)[0] ?? "";
  if (!same(predicted, row.address) || !same(castAddr, row.address)) throw new Error(`row ${row.n}: CREATE2 → viem ${predicted} / cast ${castAddr}, expected ${row.address}`);

  const existing = await moderato.getCode({ address: row.address });
  if (existing && existing !== "0x") {
    console.log(`#${row.n} ${row.name} ${row.address}: code already on Moderato (${(existing.length - 2) / 2} B) — skipped`);
    continue;
  }
  // A constructor may depend on an earlier row (the proxy checks its implementation's code), so in a dry run an
  // estimate can revert until that row is live; a real run always estimates after its predecessors landed.
  const gas = await moderato.estimateGas({ account: account.address, to: ARACHNID, data: tx.input }).catch((e: Error & { shortMessage?: string }) => {
    if (!dryRun) throw new Error(`row ${row.n}: estimate failed: ${e.shortMessage ?? e.message}`);
    return `reverts until earlier rows are live (${e.shortMessage ?? e.message})`;
  });
  console.log(`#${row.n} ${row.name} → ${row.address} (initcode ${(initCode.length - 2) / 2} B, estimate ${gas})`);
  if (dryRun) continue;

  const receipt = castSend("deployer", [ARACHNID, tx.input], { extra: ["--gas-limit", "29500000", "--priority-gas-price", "1"] });
  const block = BigInt(receipt.blockNumber);
  const code = await moderato.getCode({ address: row.address });
  console.log(`  tx ${receipt.transactionHash} block ${block} status ${receipt.status} gasUsed ${BigInt(receipt.gasUsed)} code ${code ? (code.length - 2) / 2 : 0} B`);
  if (receipt.status !== "0x1" || !code || code === "0x") throw new Error(`row ${row.n}: replay failed`);
  // One replay per block: wait until the head has moved past the receipt's block.
  while ((await moderato.getBlockNumber()) <= block) await new Promise((r) => setTimeout(r, 500));
}
