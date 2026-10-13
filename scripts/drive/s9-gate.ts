/**
 * S9's gate, live on Moderato through the deployed web and relay (stage-09 step 10):
 *  A. copy in ONE transaction and stop in ONE transaction **sponsored by the deployed relay** (`/api/relay`: the
 *     strategies policy sponsors `unsubscribe` with its `vault2.revoke` companion) — a throwaway wallet the faucet
 *     funds copies #2, then stops it; the receipt's fee payer is the relay's, not the wallet;
 *  B. the runner's placements come from the copier's STRATEGY grants: every copy fill of the live copier is an
 *     `Executed` the vault index holds under one of the copier's STRATEGY grants to the runner, placed by the runner;
 *  C. copier P&L = index: per settled Window, the desk's P&L (`/api/strategies/mine`, the runner's fills scored by the
 *     engine's payout) equals the vault index's own (`Settled` payout − cash paid on the grant's fills).
 * Keys are read from ~/.config/cwf/testnet/ and never printed; `DATABASE_URL` reaches the testnet index.
 *
 *   DATABASE_URL=… pnpm --dir scripts exec tsx drive/s9-gate.ts --copier 0x… [--origin https://mitoshi.xyz]
 */
import { getAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import type { TxIntent } from "@cwf/core";
import { createSql } from "@cwf/db";
import { nowSec, sendBatch, tempoReadClient } from "@cwf/markets";
import { driveClient } from "@cwf/markets/drive";
import { encodeStrategyIntent, strategyVenueOf } from "@cwf/markets/strategies";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const origin = flag("--origin") ?? "https://mitoshi.xyz";
const copierFlag = flag("--copier");
if (!copierFlag || !process.env.DATABASE_URL) throw new Error("usage: DATABASE_URL=… s9-gate.ts --copier 0x… [--origin …]");
const copier = getAddress(copierFlag);
const CHAIN_ID = 42431;
const ONE = 1_000_000n;
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);
const venue = strategyVenueOf(CHAIN_ID)!;
const runner = getAddress(loadRole("strategy-runner").address);
const results: { check: string; ok: boolean }[] = [];
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const check = (name: string, ok: boolean, note: unknown) => {
  results.push({ check: name, ok });
  log({ check: name, ok, note });
};
const read = <T>(functionName: string, args: readonly unknown[]) => client.readContract({ address: venue.strategyRegistry, abi: strategyRegistryAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

// A. Copy (self-paid, one tx) and stop (sponsored by the deployed relay, one tx), from a fresh wallet.
const account = privateKeyToAccount(generatePrivateKey());
const wallet = driveClient(account as never, `${origin}/api/relay`);
await client.request({ method: "tempo_fundAddress" as never, params: [account.address] as never });
await new Promise((r) => setTimeout(r, 3_000));
const subscribersBefore = (await read<{ subscribers: number }>("strategyOf", [2n])).subscribers;
async function send(step: string, intent: TxIntent) {
  const r = encodeStrategyIntent(intent, { chainId: CHAIN_ID, wallet: account.address });
  if (!r?.ok) throw new Error(`${step}: encode refused: ${r?.diagnosis.technical}`);
  const sent = await sendBatch(wallet as never, { calls: r.value.calls, sponsored: r.value.sponsored, nonce: { kind: "expiring" }, nowSec: nowSec() });
  const feePayer = (sent.receipt as { feePayer?: string }).feePayer ?? null;
  log({ step, calls: r.value.calls.length, sponsored: r.value.sponsored, tx: sent.hash, status: sent.receipt.status, gas: sent.receipt.gasUsed, feePayer });
  return { ...sent, feePayer, sponsored: r.value.sponsored, calls: r.value.calls.length };
}
const caps = { maxStakePerTradeBase: 2n * ONE, maxDailySpendBase: 10n * ONE, maxOpenPositions: 1, maxPriceRaw: 900_000n, market: null };
const copy = await send("copy #2", { kind: "strategy-copy", strategyId: 2n, runner, caps, expiresAtSec: nowSec() + 86_400, budgetBase: 10n * ONE, depositBase: 10n * ONE, mode: "follow", maxFeeBase: 0n });
const sub = await read<{ grantId: bigint; active: boolean }>("subscriptionOf", [2n, account.address]);
check("copy is one self-paid transaction and leaves a live consent", copy.receipt.status === "success" && !copy.sponsored && copy.calls > 1 && sub.active && (await read<boolean>("isSubscriptionLive", [2n, account.address])), { tx: copy.hash, calls: copy.calls, grantId: sub.grantId });
const stop = await send("stop #2", { kind: "strategy-stop", strategyId: 2n, grantId: sub.grantId });
const after = await read<{ active: boolean }>("subscriptionOf", [2n, account.address]);
const subscribersAfter = (await read<{ subscribers: number }>("strategyOf", [2n])).subscribers;
check(
  "stop is one transaction the deployed relay sponsors (revoke + unsubscribe)",
  stop.receipt.status === "success" && stop.sponsored && stop.calls === 2 && stop.feePayer !== null && getAddress(stop.feePayer) !== getAddress(account.address) && !after.active && subscribersAfter === subscribersBefore,
  { tx: stop.hash, feePayer: stop.feePayer, subscribersBefore, subscribersAfter },
);

// B + C. The live copier: its fills against the vault index, and its P&L against the index's.
const sql = createSql(process.env.DATABASE_URL);
const mine = (await (await fetch(`${origin}/api/strategies/mine?wallet=${copier}`, { cache: "no-store" })).json()) as {
  subscriptions: { strategyId: string; grantId: string; active: boolean }[];
  fills: { strategyId: string; marketId: string; txHash: string; cashDeltaBase: string; settled: boolean; pnlBase: string | null }[];
};
// The copier's STRATEGY grants (GrantKind 2) to the runner, past and present: a new budget re-grants, so older fills ride
// a grant that has since been replaced.
const grants = new Set(
  (await sql<{ grant_id: string }[]>`select grant_id::text from idx_vault_grants where lower(owner) = ${copier.toLowerCase()} and kind = 2 and lower(actor) = ${runner.toLowerCase()}`).map((g) => g.grant_id),
);
const executions = await sql<{ tx_hash: string; market: string; grant_id: string; actor: string; cash_delta: string }[]>`
  select tx_hash, market, grant_id::text, actor, cash_delta::text from idx_vault_executions where lower(owner) = ${copier.toLowerCase()} and grant_id > 0`;
const byTx = new Map(executions.map((e) => [e.tx_hash.toLowerCase(), e]));
const unmatched = mine.fills.filter((f) => {
  const e = byTx.get(f.txHash.toLowerCase());
  return !e || getAddress(e.actor) !== runner || !grants.has(e.grant_id) || BigInt(e.cash_delta) !== BigInt(f.cashDeltaBase);
});
check("every copy fill is the runner's placement on the copier's STRATEGY grant, as the vault index holds it", mine.fills.length > 0 && unmatched.length === 0, { fills: mine.fills.length, grants: [...grants], unmatched: unmatched.map((f) => f.txHash) });

const settled = [...new Set(mine.fills.filter((f) => f.settled).map((f) => f.marketId.toLowerCase()))];
const rows = settled.length
  ? await sql<{ market: string; paid: string; payout: string }[]>`
      select m.market, coalesce((select sum(cash_delta) from idx_vault_executions e where lower(e.owner) = ${copier.toLowerCase()} and lower(e.market) = m.market and e.grant_id > 0), 0)::text as paid,
             coalesce((select sum(payout_base) from idx_vault_settlements s where lower(s.owner) = ${copier.toLowerCase()} and lower(s.market) = m.market), 0)::text as payout
      from unnest(${settled}::text[]) as m(market)`
  : [];
const perMarket = rows.map((r) => {
  const desk = mine.fills.filter((f) => f.marketId.toLowerCase() === r.market).reduce((sum, f) => sum + BigInt(f.pnlBase ?? "0"), 0n);
  const index = BigInt(r.payout) - BigInt(r.paid);
  return { market: r.market, desk, index, paidOut: BigInt(r.payout) > 0n };
});
check("copier P&L = index on every settled Window", perMarket.length > 0 && perMarket.every((m) => m.desk === m.index), perMarket);

await sql.end();
const failed = results.filter((r) => !r.ok).length;
log({ step: "done", checks: results.length, failed });
process.exitCode = failed ? 1 : 0;
