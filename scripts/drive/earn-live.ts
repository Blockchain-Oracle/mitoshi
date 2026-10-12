/**
 * The `/earn` slice's live check on Moderato through the deployed relay (S8 box 2): a fresh wallet the faucet funds
 * supplies the maker vault in ONE self-paid transaction (`[approve, supply]`, the page's own `maker-supply` encoding),
 * the page's reads show its shares and the ledger's supply from the vault's own event, then it withdraws every idle
 * share in one transaction **the deployed relay sponsors** — settling any closed Window first, exactly as the page's
 * withdraw does — and the ledger shows the money back. Then the same on the range reserve ($1). Nothing is printed
 * but receipts and figures; the throwaway key is never written anywhere.
 *
 *   NETWORK=testnet pnpm --dir scripts exec tsx drive/earn-live.ts [--origin https://testnet.mitoshi.xyz]
 */
import { getAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { makerSheet, rangeSheet, realizedYield, supplierPosition, type TxIntent } from "@cwf/core";
import { nowSec, sendBatch, tempoReadClient } from "@cwf/markets";
import { driveClient } from "@cwf/markets/drive";
import { encodeMakerIntent, getMakerSharesOf, getMakerUnsettledExpired, getMakerVaultState, getSupplyLedgerOf, isMakerWindowSettleable } from "@cwf/markets/maker";
import { encodeRangeIntent, getRangeReserveState, getRangeSharesOf } from "@cwf/markets/range";
import type { EncodeContext, EncodeResult } from "@cwf/markets";

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const origin = flag("--origin") ?? "https://testnet.mitoshi.xyz";
const CHAIN_ID = 42431;
const ONE = 1_000_000n;
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);
const results: { check: string; ok: boolean }[] = [];
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const check = (name: string, ok: boolean, note: unknown) => {
  results.push({ check: name, ok });
  log({ check: name, ok, note });
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: { technical: string } }, what: string): T => {
  if (!r.ok) throw new Error(`${what}: ${r.error.technical}`);
  return r.value;
};

const account = privateKeyToAccount(generatePrivateKey());
const wallet = driveClient(account as never, `${origin}/api/relay`);
const ctx: EncodeContext = { chainId: CHAIN_ID, wallet: account.address };
await client.request({ method: "tempo_fundAddress" as never, params: [account.address] as never });
await sleep(3_000);
log({ step: "funded", wallet: account.address });

async function send(step: string, encoded: EncodeResult | null) {
  if (!encoded?.ok) throw new Error(`${step}: encode refused: ${encoded ? encoded.diagnosis.technical : "unclaimed"}`);
  const sent = await sendBatch(wallet as never, { calls: encoded.value.calls, sponsored: encoded.value.sponsored, nonce: { kind: "expiring" }, nowSec: nowSec() });
  const feePayer = (sent.receipt as { feePayer?: string }).feePayer ?? null;
  const relayPaid = feePayer !== null && getAddress(feePayer) !== getAddress(account.address);
  log({ step, calls: encoded.value.calls.length, sponsored: encoded.value.sponsored, tx: sent.hash, status: sent.receipt.status, gas: sent.receipt.gasUsed, feePayer, relayPaid });
  return { ...sent, feePayer, relayPaid, sponsored: encoded.value.sponsored, calls: encoded.value.calls.length };
}
const maker = (intent: TxIntent) => encodeMakerIntent(intent, ctx);
const range = (intent: TxIntent) => encodeRangeIntent(intent, ctx);

// ── the maker vault ──
const SUPPLY = 5n * ONE;
const supplied = await send("maker supply $5", maker({ kind: "maker-supply", amountBase: SUPPLY }));
let shares = unwrap(await getMakerSharesOf(account.address), "makerShares");
let ledger = unwrap(await getSupplyLedgerOf("maker", account.address), "ledger");
check(
  "supply is one self-paid transaction [approve, supply]; the page reads the shares and the ledger reads the event",
  supplied.receipt.status === "success" && !supplied.sponsored && supplied.calls === 2 && shares.shares > 0n && ledger !== null && ledger.suppliedBase === SUPPLY && ledger.supplies === 1,
  { tx: supplied.hash, shares: shares.shares, worth: shares.worthBase, ledger },
);

// The page's withdraw: settle every closed Window the vault names, each once the engine has its print, then redeem.
let settles = 0;
for (let round = 0; round < 16; round += 1) {
  const stale = unwrap(await getMakerUnsettledExpired(), "unsettled");
  if (!stale) break;
  let ready = unwrap(await isMakerWindowSettleable(stale), "settleable");
  for (let waited = 0; !ready && waited < 120_000; waited += 5_000) {
    await sleep(5_000);
    ready = unwrap(await isMakerWindowSettleable(stale), "settleable");
  }
  if (!ready) throw new Error(`the print for ${stale} never landed`);
  const s = await send(`maker settle ${stale.slice(0, 10)}`, maker({ kind: "maker-settle", marketId: stale }));
  if (s.receipt.status !== "success" || !s.relayPaid) throw new Error("settle failed or was not sponsored");
  settles += 1;
}
const vault = unwrap(await getMakerVaultState(), "vault");
if (!vault) throw new Error("no maker vault");
shares = unwrap(await getMakerSharesOf(account.address), "makerShares");
const position = supplierPosition(makerSheet(vault), shares.shares, shares.worthBase);
const withdrawn = await send("maker withdraw idle", maker({ kind: "maker-withdraw", shares: position.idleShares }));
ledger = unwrap(await getSupplyLedgerOf("maker", account.address), "ledger");
const after = unwrap(await getMakerSharesOf(account.address), "makerShares");
const yieldNow = ledger ? realizedYield({ suppliedBase: ledger.suppliedBase, withdrawnBase: ledger.withdrawnBase, worthBase: after.worthBase }) : null;
check(
  "withdraw of every idle share is one transaction the deployed relay sponsors; the ledger shows the money back",
  withdrawn.receipt.status === "success" && withdrawn.sponsored && withdrawn.relayPaid && ledger !== null && ledger.withdrawals === 1 && ledger.withdrawnBase > 0n && after.shares === shares.shares - position.idleShares,
  { tx: withdrawn.hash, feePayer: withdrawn.feePayer, settlesFirst: settles, idleShares: position.idleShares, committed: position.committedBase, ledger, realized: yieldNow },
);

// ── the range reserve, the same two instructions ──
const RANGE_SUPPLY = 1n * ONE;
const rs = await send("range supply $1", range({ kind: "range-supply", amountBase: RANGE_SUPPLY }));
const rShares = unwrap(await getRangeSharesOf(account.address), "rangeShares");
const reserve = unwrap(await getRangeReserveState(), "rangeReserve");
if (!reserve) throw new Error("no range reserve");
const rPos = supplierPosition(rangeSheet(reserve), rShares.shares, rShares.worthBase);
const rw = await send("range withdraw idle", range({ kind: "range-withdraw", shares: rPos.idleShares }));
const rLedger = unwrap(await getSupplyLedgerOf("range", account.address), "ledger");
check(
  "the range reserve takes the same supply and sponsored withdraw, and its ledger reads both events",
  rs.receipt.status === "success" && !rs.sponsored && rw.receipt.status === "success" && rw.relayPaid && rLedger !== null && rLedger.suppliedBase === RANGE_SUPPLY && rLedger.withdrawals === 1,
  { supply: rs.hash, withdraw: rw.hash, ledger: rLedger },
);

const failed = results.filter((r) => !r.ok).length;
log({ step: "done", checks: results.length, failed });
process.exitCode = failed ? 1 : 0;
