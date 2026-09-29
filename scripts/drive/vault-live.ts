/**
 * S7 live drive on Moderato: the Trading Balance's session-key tap flow on the deployed EventVault against a live
 * Window the S3 roller listed (the vault lane holds no roller role; the S3 price relay records the prints and its
 * settler settles). Every step is a real Tempo transaction signed by a throwaway account funded with
 * `tempo_fundAddress` (keys live in `VAULT_DRIVE_DIR`, 0600, never printed; `scripts/lib/cast.ts`).
 *
 *   maker    only if a side of the live book is empty (S3's house maker usually quotes): PostOnly on that side
 *   owner    depositAndGrant — one self-paid tx: deposit 10, SESSION grant to the session key scoped to this Window
 *            (D-091), 2 per tap, 5 per day, 3 open sides, price cap 0.95, 6 h, budget 5
 *   session  tap Up: placeFor(YES, 1, limit = the live ask) · tap Down: placeFor(NO, 1, YES-limit = the live bid)
 *   session  an over-cap tap (YES at 0.99) is refused before any tx: OverPriceCap(990000, 950000) — eth_call
 *   owner    revoke — the unspent budget returns to the Trading Balance
 *   (S3)     close print + settle; then session (any keeper) crankSettle(owner) credits the payout to the owner
 *   owner    partial withdraw (P12 pre-checked) to the owner's own wallet
 * Fees: the session key pays its own fee here; the relay that sponsors `placeFor` is S4's (`relay/policies/vault.ts`).
 *
 *   VAULT_DRIVE_DIR=<dir> pnpm --dir scripts exec tsx drive/vault-live.ts
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, type Hex, BaseError, ContractFunctionRevertedError, createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, maxUint256 } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { PATH_USD, castSend } from "../lib/cast.js";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
const ENGINE = getAddress(d["42431"]!.engine!.contracts.EventsEngine!.address);
const LENS = getAddress(d["42431"]!.engine!.contracts.EngineLens!.address);
const VAULT = getAddress(d["42431"]!.vault!.contracts.EventVault!.address);
const ONE = 1_000_000n;
const dir = process.env.VAULT_DRIVE_DIR;
if (!dir) throw new Error("set VAULT_DRIVE_DIR (outside the repo) for the throwaway key files");
mkdirSync(dir, { recursive: true });

const log = (step: string, o: Record<string, unknown>) => console.log(JSON.stringify({ step, ...o }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function wallet(name: string): { file: string; address: Address } {
  const file = join(dir!, `${name}.json`);
  if (!existsSync(file)) {
    writeFileSync(file, execFileSync("cast", ["wallet", "new", "--json"]).toString());
    chmodSync(file, 0o600);
  }
  return { file, address: getAddress((JSON.parse(readFileSync(file, "utf8")) as { data: { address: string }[] }).data[0]!.address) };
}

async function fund(a: Address) {
  const bal = () => client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [a] });
  if ((await bal()) > 100n * ONE) return;
  execFileSync("cast", ["rpc", "tempo_fundAddress", a, "--rpc-url", RPC], { stdio: "ignore" });
  for (let i = 0; i < 30; i++, await sleep(1000)) if ((await bal()) > 0n) return;
  throw new Error(`funding ${a} did not land`);
}

function send(w: { file: string }, to: Address, data: Hex, step: string, extra: Record<string, unknown> = {}) {
  const r = castSend([to, data], { signer: { walletFile: w.file }, rpc: RPC });
  if (r.status !== "0x1" && r.status !== "1") throw new Error(`${step} failed: ${r.transactionHash}`);
  log(step, { tx: r.transactionHash, block: Number(r.blockNumber), gasUsed: Number(r.gasUsed), status: r.status, ...extra });
  return r;
}
const vaultCall = (fn: string, args: unknown[]) => encodeFunctionData({ abi: eventVaultAbi, functionName: fn as never, args: args as never });
const engineCall = (fn: string, args: unknown[]) => encodeFunctionData({ abi: eventsEngineAbi, functionName: fn as never, args: args as never });
const ref = (m: Hex) => client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketRef", args: [m] });

/** A BTC/ETH/SOL (101–103) Window the S3 roller listed, trading (or about to) with ≥ 150 s left before lock. */
async function pickWindow(): Promise<Hex> {
  for (;;) {
    const cfg = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "config" });
    const now = BigInt(Math.floor(Date.now() / 1000));
    for (let i = cfg.nextMIdx; i > 0 && i > cfg.nextMIdx - 24; i--) {
      const m = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketIdAt", args: [i] });
      const r = await ref(m);
      if (r.ticker >= 101 && r.ticker <= 103 && r.state === 0 && BigInt(r.lockAt) - now >= 150n && BigInt(r.tradingStart) - now <= 60n) return m;
    }
    await sleep(10_000);
  }
}

async function simulateRefusal(from: Address, grantId: bigint, m: Hex, lockAt: bigint): Promise<string> {
  try {
    await client.simulateContract({ account: from, address: VAULT, abi: eventVaultAbi, functionName: "placeFor", args: [grantId, m, 0, true, 990_000n, ONE, lockAt * 1_000_000_000n] });
    return "accepted";
  } catch (e) {
    const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
    return rev instanceof ContractFunctionRevertedError ? `${rev.data?.errorName}(${(rev.data?.args ?? []).join(", ")})` : String(e).slice(0, 200);
  }
}

const owner = wallet("owner");
const session = wallet("session");
const maker = wallet("maker");
for (const w of [owner, session, maker]) await fund(w.address);
log("accounts", { owner: owner.address, session: session.address, maker: maker.address, vault: VAULT });

const m = await pickWindow();
const r0 = await ref(m);
const lockAt = BigInt(r0.lockAt);
log("window", { marketId: m, ticker: r0.ticker, tradingStart: r0.tradingStart, lockAt: r0.lockAt, status: r0.status });

// S3's house maker usually quotes the Window already; the drive's maker only fills an empty side, never crossing.
const top = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "topOfBook", args: [m] });
log("book (lens.topOfBook)", { ...top });
const quote = (kind: number, ticks: number) =>
  engineCall("placeOrder", [{ marketId: m, kind, orderType: 3, selfMatch: 0, priceTicks: ticks, lots: 10_000n, expireTs: Number(lockAt), maxFills: 16, maxEvictions: 16, useCredit: false, withdrawProceeds: false, clientId: 0n }]);
if (top.askLots < 1_000n || top.bidLots < 1_000n) {
  send(maker, PATH_USD, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ENGINE, maxUint256] }), "maker approve engine");
  if (top.bidLots < 1_000n) send(maker, ENGINE, quote(0, top.askTicks > 0 ? Math.min(480, top.askTicks - 1) : 480), "maker PostOnly BUY_YES (YES bid) x 10,000 lots");
  if (top.askLots < 1_000n) send(maker, ENGINE, quote(2, top.bidTicks > 0 ? Math.max(520, top.bidTicks + 1) : 520), "maker PostOnly BUY_NO (YES ask) x 10,000 lots");
}
const book = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "topOfBook", args: [m] });
const askRaw = BigInt(book.askTicks) * 1000n;
const bidRaw = BigInt(book.bidTicks) * 1000n;
log("taps will take", { askRaw, bidRaw });

send(owner, PATH_USD, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [VAULT, maxUint256] }), "owner approve vault");
const caps = { maxStakePerTrade: 2n * ONE, maxDailySpend: 5n * ONE, maxOpenPositions: 3, maxPriceRaw: 950_000n, market: m };
const expiry = BigInt(Math.floor(Date.now() / 1000) + 6 * 3600);
send(owner, VAULT, vaultCall("depositAndGrant", [10n * ONE, 0, session.address, caps, expiry, 5n * ONE]), "owner depositAndGrant (arm, self-paid)");
const grantId = await client.readContract({ address: VAULT, abi: eventVaultAbi, functionName: "activeGrantOf", args: [owner.address, 0] });
log("grant", { grantId });

while ((await ref(m)).openE8 === 0n || (await ref(m)).status !== 1) await sleep(2_000); // S3 records the open print
log("open print", { openE8: (await ref(m)).openE8 });

const grant = () => client.readContract({ address: VAULT, abi: eventVaultAbi, functionName: "grantOf", args: [grantId] });
send(session, VAULT, vaultCall("placeFor", [grantId, m, 0, true, askRaw, ONE, lockAt * 1_000_000_000n]), "session tap Up (placeFor YES 1 at the ask)");
log("after tap Up", { budget: (await grant()).budget });
send(session, VAULT, vaultCall("placeFor", [grantId, m, 1, true, bidRaw, ONE, lockAt * 1_000_000_000n]), "session tap Down (placeFor NO 1 at 1 - bid)");
const g = await grant();
log("after taps", { budget: g.budget, spentToday: g.spentToday, openPositions: g.openPositions });
log("over-cap tap refused before any tx (eth_call)", { reason: await simulateRefusal(session.address, grantId, m, lockAt) });

send(owner, VAULT, vaultCall("revoke", [grantId]), "owner revoke");
log("owner account", { ...(await client.readContract({ address: VAULT, abi: eventVaultAbi, functionName: "accountOf", args: [owner.address] })) });

for (let s = (await ref(m)).status; s !== 4 && s !== 5; s = (await ref(m)).status) await sleep(5_000); // S3 settles
const settled = await ref(m);
log("settled", { status: settled.status, openE8: settled.openE8, closeE8: settled.closeE8, payoutYes: settled.payoutYes, payoutNo: settled.payoutNo });
send(session, VAULT, vaultCall("crankSettle", [owner.address, m]), "session (any keeper) crankSettle(owner)");
const acct = await client.readContract({ address: VAULT, abi: eventVaultAbi, functionName: "accountOf", args: [owner.address] });
log("owner account after crank", { ...acct });
send(owner, VAULT, vaultCall("withdraw", [acct.available / 2n]), "owner partial withdraw (half)");
const pos = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "positionOf", args: [m, VAULT] });
log("vault engine position after crank", { ...pos });
