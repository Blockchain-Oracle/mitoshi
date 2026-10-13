/**
 * R4-5 live drive on Moderato (D-227): the other half of `range-live.ts` — settle the drive's rounds on the
 * redeployed RangeReserve once their Windows have answered, then claim the ones that won. Both calls are
 * permissionless; a claim only ever pays the round's owner. A Window the engine has not answered is skipped by name
 * (`NotSettled`); run again later.
 *
 *   RANGE_DRIVE_DIR=<the same dir as range-live.ts> pnpm --dir scripts exec tsx drive/range-settle.ts [roundId ...]
 * No ids: every round the drive's opener owns. Prints each round as the chain reads it back.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BaseError, ContractFunctionRevertedError, createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, type Address, type Hex } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { rangeReserveAbi } from "@cwf/clients/abis/RangeReserve";
import { PATH_USD, castSend } from "../lib/cast.js";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
const RESERVE = getAddress(d["42431"]!.range!.contracts.RangeReserve!.address);
const STATUS = ["LIVE", "WON", "LOST", "VOID", "CLAIMED"] as const;

const dir = process.env.RANGE_DRIVE_DIR;
if (!dir) throw new Error("set RANGE_DRIVE_DIR (the dir range-live.ts used) for the opener's key file");
const walletFile = join(dir, "range-opener.json");
if (!existsSync(walletFile)) throw new Error("no range-opener.json in RANGE_DRIVE_DIR — run range-live.ts first");
const opener = getAddress((JSON.parse(readFileSync(walletFile, "utf8")) as { data: { address: string }[] }).data[0]!.address) as Address;

const log = (step: string, o: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, atUtc: new Date().toISOString(), ...o }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const reason = (e: unknown) => {
  const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  return rev instanceof ContractFunctionRevertedError ? `${rev.data?.errorName ?? "revert"}(${(rev.data?.args ?? []).join(",")})` : String(e).slice(0, 160);
};
const round = (id: bigint) => client.readContract({ address: RESERVE, abi: rangeReserveAbi, functionName: "roundOf", args: [id] });
const balance = () => client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [opener] });

/** Simulate first, so an unanswered Window is named instead of spending a reverted transaction. */
async function send(fn: "settle" | "claim", id: bigint): Promise<boolean> {
  try {
    await client.simulateContract({ address: RESERVE, abi: rangeReserveAbi, functionName: fn, args: [id], account: opener });
  } catch (e) {
    log(`${fn} skipped`, { roundId: id, why: reason(e) });
    return false;
  }
  const data = (encodeFunctionData as (x: unknown) => Hex)({ abi: rangeReserveAbi, functionName: fn, args: [id] });
  const r = castSend([RESERVE, data], { signer: { walletFile }, rpc: RPC });
  if (r.status !== "0x1" && r.status !== "1") throw new Error(`${fn}(${id}) reverted: ${r.transactionHash}`);
  log(fn, { roundId: id, tx: r.transactionHash, block: Number(r.blockNumber) });
  return true;
}

const count = await client.readContract({ address: RESERVE, abi: rangeReserveAbi, functionName: "roundCount" });
const asked = process.argv.slice(2).map((x) => BigInt(x));
const ids = asked.length > 0 ? asked : Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
const before = await balance();
for (const id of ids) {
  const r0 = await round(id);
  if (asked.length === 0 && getAddress(r0.owner) !== opener) continue;
  if (STATUS[r0.status] === "LIVE") await send("settle", id);
  if (STATUS[(await round(id)).status] === "WON") await send("claim", id);
  const r = await round(id);
  log("round", { roundId: id, status: STATUS[r.status], band: [r.lowPrint, r.highPrint], opening: r.openingPrint, closing: r.closingPrint, stake: r.stake, maxPayout: r.maxPayout, expirySec: r.expirySec });
}
log("opener balance", { opener, before, after: await balance() });
