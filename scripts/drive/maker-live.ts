/**
 * S8 live drive on Moderato: the Earn maker vault quotes a live Window the S3 roller listed, a wallet taker and an
 * EventVault taker fill against it, it merges, pulls after lock (anyone), and settles on S3's resolution. The vault's
 * own quoting entry is signed by its maker key (`deployer-maker`, the admin until S4's earn-quoter takes over through
 * `setMaker`); everyone else is a throwaway account funded with `tempo_fundAddress` (keys in `MAKER_DRIVE_DIR`,
 * 0600, never printed; `scripts/lib/cast.ts`).
 *
 *   supplier  approve + supply 50 (self-paid capital intake)
 *   maker     quote #1: 10 ticks inside a two-sided house book (0.48/0.52 on an empty book), 2 a side
 *   (lens)    levelsRaw shows the vault's quotes as the top of both sides of the book
 *   taker     wallet mode: BUY_NO IOC at the vault's bid (the vault is handed YES)
 *   vaultOwner EventVault `place` YES at the vault's ask (the vault is handed NO)
 *   taker     (anyone) merge → the spread realized
 *   maker     quote #2; taker hits its bid only
 *   taker     (anyone) pull after lockAt — refused before lock (eth_call), accepted after
 *   (S3)      close print + settle; then taker (any keeper) settle → payout, realized for the Window
 *   supplier  partial withdraw (P12 pre-checked)
 *
 *   MAKER_DRIVE_DIR=<dir> pnpm --dir scripts exec tsx drive/maker-live.ts
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
import { marketMakerVaultAbi } from "@cwf/clients/abis/MarketMakerVault";
import { PATH_USD, castSend, type Signer } from "../lib/cast.js";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
const ENGINE = getAddress(d["42431"]!.engine!.contracts.EventsEngine!.address);
const LENS = getAddress(d["42431"]!.engine!.contracts.EngineLens!.address);
const EVENT_VAULT = getAddress(d["42431"]!.vault!.contracts.EventVault!.address);
const MAKER_VAULT = getAddress(d["42431"]!.maker!.contracts.MarketMakerVault!.address);
const ONE = 1_000_000n;
const QTY = 2n * ONE;
const NS = 1_000_000_000n;
const dir = process.env.MAKER_DRIVE_DIR;
if (!dir) throw new Error("set MAKER_DRIVE_DIR (outside the repo) for the throwaway key files");
mkdirSync(dir, { recursive: true });

const log = (step: string, o: Record<string, unknown>) => console.log(JSON.stringify({ step, ...o }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => BigInt(Math.floor(Date.now() / 1000));

function wallet(name: string): { signer: Signer; address: Address } {
  const file = join(dir!, `${name}.json`);
  if (!existsSync(file)) {
    writeFileSync(file, execFileSync("cast", ["wallet", "new", "--json"]).toString());
    chmodSync(file, 0o600);
  }
  return { signer: { walletFile: file }, address: getAddress((JSON.parse(readFileSync(file, "utf8")) as { data: { address: string }[] }).data[0]!.address) };
}

async function fund(a: Address) {
  const bal = () => client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [a] });
  if ((await bal()) > 100n * ONE) return;
  execFileSync("cast", ["rpc", "tempo_fundAddress", a, "--rpc-url", RPC], { stdio: "ignore" });
  for (let i = 0; i < 30; i++, await sleep(1000)) if ((await bal()) > 0n) return;
  throw new Error(`funding ${a} did not land`);
}

function send(w: { signer: Signer }, to: Address, data: Hex, step: string, extra: Record<string, unknown> = {}) {
  const r = castSend([to, data], { signer: w.signer, rpc: RPC });
  if (r.status !== "0x1" && r.status !== "1") throw new Error(`${step} failed: ${r.transactionHash}`);
  log(step, { tx: r.transactionHash, block: Number(r.blockNumber), gasUsed: Number(r.gasUsed), status: r.status, ...extra });
  return r;
}
const mv = (fn: string, args: unknown[]) => encodeFunctionData({ abi: marketMakerVaultAbi, functionName: fn as never, args: args as never });
const ev = (fn: string, args: unknown[]) => encodeFunctionData({ abi: eventVaultAbi, functionName: fn as never, args: args as never });
const en = (fn: string, args: unknown[]) => encodeFunctionData({ abi: eventsEngineAbi, functionName: fn as never, args: args as never });
const lens = <F extends string>(functionName: F, args: unknown[]) =>
  client.readContract({ address: LENS, abi: engineLensAbi, functionName: functionName as never, args: args as never }) as Promise<any>;
const vault = (functionName: string, args: unknown[] = []) =>
  client.readContract({ address: MAKER_VAULT, abi: marketMakerVaultAbi, functionName: functionName as never, args: args as never }) as Promise<any>;
const approve = (spender: Address) => encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] });

async function refusal(from: Address, fn: string, args: unknown[]): Promise<string> {
  try {
    await client.simulateContract({ account: from, address: MAKER_VAULT, abi: marketMakerVaultAbi, functionName: fn as never, args: args as never });
    return "accepted";
  } catch (e) {
    const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
    return rev instanceof ContractFunctionRevertedError ? `${rev.data?.errorName}(${(rev.data?.args ?? []).join(", ")})` : String(e).slice(0, 200);
  }
}

/**
 * A Window the S3 roller listed: Trading, open print in (takers need it, T01), ≥ 200 s to lock. Priced like
 * Masayume's maker: 10 ticks inside a two-sided book ≥ 40 ticks wide, or around even odds (0.48/0.52) when the book
 * is empty (F-S8-05: many rolled Windows carry no house quotes); a one-sided or tight book is skipped.
 */
async function pickWindow(): Promise<{ m: Hex; bid: number; ask: number }> {
  for (;;) {
    const cfg = await lens("config", []);
    for (let i = cfg.nextMIdx; i > 0 && i > cfg.nextMIdx - 30; i--) {
      const m = (await lens("marketIdAt", [i])) as Hex;
      const r = await lens("marketRef", [m]);
      if (r.status !== 1 || r.openE8 === 0n || BigInt(r.lockAt) - now() < 200n) continue;
      const t = await lens("topOfBook", [m]);
      if (t.bidTicks > 0 && t.askTicks > 0 && t.askTicks - t.bidTicks >= 40) return { m, bid: t.bidTicks + 10, ask: t.askTicks - 10 };
      if (t.bidTicks === 0 && t.askTicks === 0) return { m, bid: 480, ask: 520 };
    }
    await sleep(5_000);
  }
}

const maker = { signer: { role: "deployer-maker" } as Signer, address: getAddress("0xE41f5FEb2bc3040B82bA22dc6F62b824037e1A8d") };
const supplier = wallet("supplier");
const taker = wallet("taker");
const owner = wallet("event-vault-owner");
for (const w of [supplier, taker, owner]) await fund(w.address);
log("accounts", { makerVault: MAKER_VAULT, maker: maker.address, supplier: supplier.address, taker: taker.address, eventVaultOwner: owner.address });
if (getAddress(await vault("maker")) !== maker.address) throw new Error("the drive's maker key is not the vault's maker");

send(supplier, PATH_USD, approve(MAKER_VAULT), "supplier approve maker vault");
send(supplier, MAKER_VAULT, mv("supply", [50n * ONE]), "supplier supply 50");
log("vault", { liquid: await vault("liquid"), shares: await vault("sharesOf", [supplier.address]), sharePriceRaw: await vault("sharePriceRaw") });

const { m, bid, ask } = await pickWindow();
const r0 = await lens("marketRef", [m]);
const lockAt = BigInt(r0.lockAt);
const bidRaw = BigInt(bid) * 1000n;
const askRaw = BigInt(ask) * 1000n;
log("window", { marketId: m, ticker: r0.ticker, lockAt: r0.lockAt, expiry: r0.expiry, houseTop: await lens("topOfBook", [m]), vaultBid: bidRaw, vaultAsk: askRaw });

send(maker, MAKER_VAULT, mv("quote", [m, bidRaw, askRaw, QTY, lockAt * NS]), "maker quote #1 (vault.quote, PostOnly pair, 2 a side)");
const bids = await lens("levelsRaw", [m, true, 2, 0, 64]);
const asks = await lens("levelsRaw", [m, false, 2, 0, 64]);
log("depth via lens.levelsRaw", { bids, asks, vaultOrders: (await lens("openOrdersOf", [m, MAKER_VAULT])).length, book: await vault("bookOf", [m]) });

send(taker, PATH_USD, approve(ENGINE), "taker approve engine");
const take = (kind: number, ticks: number) =>
  en("placeOrder", [{ marketId: m, kind, orderType: 2, selfMatch: 0, priceTicks: ticks, lots: QTY / 1000n, expireTs: Number(lockAt), maxFills: 16, maxEvictions: 4, useCredit: false, withdrawProceeds: true, clientId: 0n }]);
send(taker, ENGINE, take(2, bid), "wallet taker BUY_NO IOC at the vault's YES bid (vault handed YES)");
send(owner, PATH_USD, approve(EVENT_VAULT), "event-vault owner approve EventVault");
send(owner, EVENT_VAULT, ev("deposit", [5n * ONE]), "event-vault owner deposit 5");
send(owner, EVENT_VAULT, ev("place", [m, 0, true, askRaw, QTY, lockAt * NS]), "EventVault taker: place YES at the vault's ask (vault handed NO)");
log("vault inventory", { inventory: await vault("inventoryOf", [m]), deployed: await vault("deployedOf", [m]) });

send(taker, MAKER_VAULT, mv("merge", [m]), "taker (anyone) merge — the spread realized");
log("after merge", { liquid: await vault("liquid"), totalValue: await vault("totalValue"), sharePriceRaw: await vault("sharePriceRaw"), book: await vault("bookOf", [m]) });

send(maker, MAKER_VAULT, mv("quote", [m, bidRaw, askRaw, QTY, lockAt * NS]), "maker quote #2");
send(taker, ENGINE, take(2, bid), "wallet taker hits quote #2's bid only");
log("pull before lock by a stranger", { reason: await refusal(taker.address, "pull", [m]) });

while (now() < lockAt + 2n) await sleep(3_000);
send(taker, MAKER_VAULT, mv("pull", [m]), "taker (anyone) pull after lockAt");
log("after pull", { book: await vault("bookOf", [m]), credit: await lens("creditOf", [m, MAKER_VAULT]), orders: (await lens("openOrdersOf", [m, MAKER_VAULT])).length });

for (let s = (await lens("marketRef", [m])).status; s !== 4 && s !== 5; s = (await lens("marketRef", [m])).status) await sleep(5_000);
const settled = await lens("marketRef", [m]);
log("S3 settled the Window", { status: settled.status, openE8: settled.openE8, closeE8: settled.closeE8, payoutYes: settled.payoutYes, payoutNo: settled.payoutNo });
send(taker, MAKER_VAULT, mv("settle", [m]), "taker (any keeper) vault.settle");
const book = await vault("bookOf", [m]);
log("book after settle", { book, liquid: await vault("liquid"), totalValue: await vault("totalValue"), sharePriceRaw: await vault("sharePriceRaw"), enginePosition: await lens("positionOf", [m, MAKER_VAULT]) });

const shares = (await vault("sharesOf", [supplier.address])) as bigint;
send(supplier, MAKER_VAULT, mv("withdraw", [shares / 2n]), "supplier partial withdraw (half the shares)");
log("final", { liquid: await vault("liquid"), wallet: await client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [MAKER_VAULT] }), openWindows: await vault("openWindows") });
