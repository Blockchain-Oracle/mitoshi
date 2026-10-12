/**
 * Subscribes a wallet to strategies on Moderato the way the copy drawer does (S9.3, D-219): with no live STRATEGY grant
 * to the strategy's runner, the copy is ONE transaction (deposit + STRATEGY grant + subscribe on grant 0); with one, it
 * subscribes on that grant — never a second grant, which would revoke the first and every consent riding on it (one
 * live grant per kind per owner). A fresh wallet is funded by the faucet first. Reads the consent back.
 *
 * `--new-budget` is the drawer's "Set a new budget": ONE transaction granting a fresh budget (caps inside every listed
 * strategy's envelope) that subscribes the first strategy and carries the rest onto it; the vault revokes the old grant
 * and returns its unspent budget. A consent's current mode is kept unless the flag names one.
 *
 *   pnpm --dir scripts exec tsx drive/s9-subscribe.ts --wallet <cast wallet new --json file> --copy 1 --copy 2:fade [--budget 10] [--stake 2]
 *   pnpm --dir scripts exec tsx drive/s9-subscribe.ts --wallet <file> --new-budget --copy 3 --copy 1 --copy 2 --budget 30
 */
import { readFileSync } from "node:fs";
import { getAddress, type Address } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { SUBSCRIPTION_MODES, type SubscriptionMode, type TxIntent } from "@cwf/core";
import { tempoReadClient } from "@cwf/markets";
import { encodeStrategyIntent, strategyVenueOf } from "@cwf/markets/strategies";
import { castBatch } from "../lib/cast";

const argv = process.argv.slice(2);
const values = (name: string) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]!] : []));
const walletFile = values("--wallet")[0];
const parsed = values("--copy").map((c) => ({ id: BigInt(c.split(":")[0]!), named: c.split(":")[1] as SubscriptionMode | undefined }));
const copies = parsed.map((c) => ({ id: c.id, mode: (c.named === "fade" ? "fade" : "follow") as SubscriptionMode }));
const newBudget = argv.includes("--new-budget");
if (!walletFile || copies.length === 0) throw new Error("usage: s9-subscribe.ts --wallet <file> --copy <id>[:fade] …");
const ONE = 1_000_000n;
const budget = BigInt(values("--budget")[0] ?? "10") * ONE;
const stake = BigInt(values("--stake")[0] ?? "2") * ONE;
const CHAIN_ID = 42431;
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);
const venue = strategyVenueOf(CHAIN_ID)!;
const owner = getAddress((JSON.parse(readFileSync(walletFile, "utf8")) as { data: { address: Address }[] }).data[0]!.address);
const read = <T>(functionName: string, args: readonly unknown[]) => client.readContract({ address: venue.strategyRegistry, abi: strategyRegistryAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

const balance = await client.getBalance({ address: owner }).catch(() => 0n);
const pathUsd = (await client.readContract({ address: "0x20C0000000000000000000000000000000000000", abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [owner] })) as bigint;
if (pathUsd < budget * 2n) await client.request({ method: "tempo_fundAddress" as never, params: [owner] as never });
console.log(JSON.stringify({ owner, funded: pathUsd < budget * 2n, native: balance.toString() }));

/** The owner's live STRATEGY grant (GrantKind 2), if its actor is `runner`: a copy shares it rather than re-granting. */
async function liveGrantTo(runner: Address): Promise<boolean> {
  const vault = { address: venue.vault, abi: eventVaultV2Abi } as const;
  const id = (await client.readContract({ ...vault, functionName: "activeGrantOf", args: [owner, 2] })) as bigint;
  if (id === 0n) return false;
  const g = (await client.readContract({ ...vault, functionName: "grantOf", args: [id] })) as { actor: Address; revoked: boolean; expiresAtSec: bigint };
  return !g.revoked && g.expiresAtSec > BigInt(Math.floor(Date.now() / 1000)) && getAddress(g.actor) === getAddress(runner);
}

if (newBudget) {
  type Envelope = { maxStakePerTradeBase: bigint; maxDailySpendBase: bigint; maxOpenPositions: number; maxPriceRaw: bigint };
  const strategies = await Promise.all(parsed.map((c) => read<{ runner: Address; envelope: Envelope }>("strategyOf", [c.id])));
  const runner = strategies[0]!.runner;
  if (strategies.some((s) => getAddress(s.runner) !== getAddress(runner))) throw new Error("--new-budget carries copies of one runner only");
  const modes = await Promise.all(parsed.map(async (c) => {
    if (c.named) return c.named;
    const sub = await read<{ mode: number; active: boolean }>("subscriptionOf", [c.id, owner]);
    return SUBSCRIPTION_MODES[sub.active ? sub.mode : 0]!;
  }));
  const least = (xs: bigint[]) => xs.reduce((a, b) => (b < a ? b : a));
  const prices = strategies.map((s) => s.envelope.maxPriceRaw).filter((p) => p > 0n);
  const caps = {
    maxStakePerTradeBase: least([stake, ...strategies.map((s) => s.envelope.maxStakePerTradeBase)]),
    maxDailySpendBase: least([budget, ...strategies.map((s) => s.envelope.maxDailySpendBase)]),
    maxOpenPositions: Math.min(...strategies.map((s) => s.envelope.maxOpenPositions)),
    maxPriceRaw: prices.length ? least(prices) : 0n,
    market: null,
  };
  const intent: TxIntent = {
    kind: "strategy-copy", strategyId: parsed[0]!.id, runner, caps, expiresAtSec: Math.floor(Date.now() / 1000) + 7 * 86_400, budgetBase: budget, depositBase: budget, mode: modes[0]!, maxFeeBase: 0n,
    carry: parsed.slice(1).map((c, i) => ({ strategyId: c.id, mode: modes[i + 1]! })),
  };
  const r = encodeStrategyIntent(intent, { chainId: CHAIN_ID, wallet: owner });
  if (!r?.ok) throw new Error(`encode refused: ${r?.diagnosis.technical}`);
  const receipt = castBatch(r.value.calls, { signer: { walletFile }, extra: ["--gas-limit", "6000000"] });
  console.log(JSON.stringify({ step: "new-budget", calls: r.value.calls.length, tx: receipt.transactionHash, status: receipt.status }));
  for (const [i, c] of parsed.entries()) {
    const sub = await read<{ grantId: bigint; mode: number; active: boolean }>("subscriptionOf", [c.id, owner]);
    const live = await read<boolean>("isSubscriptionLive", [c.id, owner]);
    console.log(JSON.stringify({ strategyId: c.id.toString(), mode: modes[i], grantId: sub.grantId.toString(), live }));
    if (!live) process.exitCode = 1;
  }
  if (receipt.status !== "0x1") process.exitCode = 1;
}

for (const c of newBudget ? [] : copies) {
  const s = await read<{ runner: Address; envelope: { maxPriceRaw: bigint } }>("strategyOf", [c.id]);
  const first = !(await liveGrantTo(s.runner));
  const intent: TxIntent = first
    ? { kind: "strategy-copy", strategyId: c.id, runner: s.runner, caps: { maxStakePerTradeBase: stake, maxDailySpendBase: budget, maxOpenPositions: 2, maxPriceRaw: s.envelope.maxPriceRaw, market: null }, expiresAtSec: Math.floor(Date.now() / 1000) + 7 * 86_400, budgetBase: budget, depositBase: budget, mode: c.mode, maxFeeBase: 0n }
    : { kind: "strategy-subscribe", strategyId: c.id, grantId: 0n, mode: c.mode, maxFeeBase: 0n };
  const r = encodeStrategyIntent(intent, { chainId: CHAIN_ID, wallet: owner });
  if (!r?.ok) throw new Error(`encode refused: ${r?.diagnosis.technical}`);
  const receipt = castBatch(r.value.calls, { signer: { walletFile }, extra: ["--gas-limit", "6000000"] });
  const sub = await read<{ grantId: bigint; mode: number; active: boolean }>("subscriptionOf", [c.id, owner]);
  const live = await read<boolean>("isSubscriptionLive", [c.id, owner]);
  console.log(JSON.stringify({ step: first ? "copy" : "subscribe", strategyId: c.id.toString(), mode: c.mode, tx: receipt.transactionHash, status: receipt.status, grantId: sub.grantId.toString(), live }));
  if (receipt.status !== "0x1" || !live) process.exitCode = 1;
}
