/**
 * S9's copy and stop, live on Moderato (L-53, A-1c, D-218.2, D-219), from a throwaway wallet the faucet funds:
 *   1. copy house strategy #1 in ONE transaction — deposit + STRATEGY grant to the runner + `subscribe(1, 0, follow, 0)`;
 *   2. fade #2 on the same grant (`subscribe(2, 0, fade, 0)`: same runner, one live STRATEGY grant per owner);
 *   3. stop #1 in ONE transaction — revoke + unsubscribe: #2's consent stays, but its grant is gone, so it is not live;
 *   4. end #2.
 * Each step reads the registry back. Sends go through `cast` signed by the wallet file (never printed); the stop here is
 * self-paid — the relay's sponsored stop needs the deployed relay with the companion rule (checked in the gate).
 *
 *   pnpm --dir scripts exec tsx drive/s9-copy-live.ts --wallet <cast wallet new --json file>
 */
import { readFileSync } from "node:fs";
import { getAddress, type Address, type Hex } from "viem";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import type { TxIntent } from "@cwf/core";
import { tempoReadClient } from "@cwf/markets";
import { encodeStrategyIntent, strategyVenueOf } from "@cwf/markets/strategies";
import { castBatch } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const walletFile = argv[argv.indexOf("--wallet") + 1];
if (!walletFile || !argv.includes("--wallet")) throw new Error("usage: s9-copy-live.ts --wallet <file>");
const CHAIN_ID = 42431;
const ONE = 1_000_000n;
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);
const venue = strategyVenueOf(CHAIN_ID)!;
const runner = getAddress(loadRole("strategy-runner").address);
const copier = getAddress((JSON.parse(readFileSync(walletFile, "utf8")) as { data: { address: Address }[] }).data[0]!.address);
const signer = { walletFile };
const results: { step: string; ok: boolean }[] = [];
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

const read = <T>(functionName: string, args: readonly unknown[]) => client.readContract({ address: venue.strategyRegistry, abi: strategyRegistryAbi, functionName: functionName as never, args: args as never }) as Promise<T>;
const subOf = async (id: bigint) => {
  const s = await read<{ grantId: bigint; mode: number; active: boolean }>("subscriptionOf", [id, copier]);
  return { grantId: s.grantId, mode: s.mode === 1 ? "fade" : "follow", active: s.active, live: await read<boolean>("isSubscriptionLive", [id, copier]) };
};
function send(step: string, intent: TxIntent) {
  const r = encodeStrategyIntent(intent, { chainId: CHAIN_ID, wallet: copier });
  if (!r?.ok) throw new Error(`${step}: encode refused: ${r?.diagnosis.technical}`);
  const receipt = castBatch(r.value.calls, { signer, extra: ["--gas-limit", "6000000"] });
  log({ step, calls: r.value.calls.length, sponsoredIntent: r.value.sponsored, tx: receipt.transactionHash, block: BigInt(receipt.blockNumber), status: receipt.status, gas: BigInt(receipt.gasUsed) });
  if (receipt.status !== "0x1") throw new Error(`${step} reverted`);
  return receipt;
}
function check(step: string, ok: boolean, note: unknown) {
  results.push({ step, ok });
  log({ check: step, ok, note });
}

const funded: unknown = await client.request({ method: "tempo_fundAddress" as never, params: [copier] as never });
log({ step: "fund", copier, funded: Array.isArray(funded) ? funded.length : funded });

const caps = { maxStakePerTradeBase: 2n * ONE, maxDailySpendBase: 10n * ONE, maxOpenPositions: 1, maxPriceRaw: 900_000n, market: null };
const expiresAtSec = Math.floor(Date.now() / 1000) + 7 * 86_400;
send("copy #1 (one tx: approve + depositAndGrant + subscribe)", { kind: "strategy-copy", strategyId: 1n, runner, caps, expiresAtSec, budgetBase: 10n * ONE, depositBase: 10n * ONE, mode: "follow", maxFeeBase: 0n });
const s1 = await subOf(1n);
check("copy #1 is a live follow", s1.active && s1.live && s1.mode === "follow" && s1.grantId > 0n, s1);

send("fade #2 on the same grant", { kind: "strategy-subscribe", strategyId: 2n, grantId: 0n, mode: "fade", maxFeeBase: 0n });
const s2 = await subOf(2n);
check("fade #2 shares the grant", s2.active && s2.live && s2.mode === "fade" && s2.grantId === s1.grantId, s2);

send("stop #1 (one tx: revoke + unsubscribe)", { kind: "strategy-stop", strategyId: 1n, grantId: s1.grantId });
const after1 = await subOf(1n);
const after2 = await subOf(2n);
check("stop #1 ends its consent", !after1.active && !after1.live, after1);
check("#2's consent stays but is no longer live (its grant was revoked)", after2.active && !after2.live, after2);

send("end #2", { kind: "strategy-unsubscribe", strategyId: 2n });
const end2 = await subOf(2n);
check("#2 ended", !end2.active, end2);
const counts = await Promise.all([1n, 2n].map(async (id) => (await read<{ subscribers: number }>("strategyOf", [id])).subscribers));
check("both strategies back to their subscriber counts", counts.every((c) => c === 0), counts);
const failed = results.filter((r) => !r.ok).length;
log({ step: "done", checks: results.length, failed });
process.exitCode = failed ? 1 : 0;
