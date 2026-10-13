/**
 * S24 gate, live on Moderato: "v1 balances withdraw and v1 positions crank", and since D-213 the same for the retired
 * EventVaultV2. A passkey-shaped root funds each previous Trading Balance and books a $1 Up there with its own `place`
 * (the app sends nothing new to a previous vault, so these two calls are raw and self-paid). Then, through the app's
 * own encoder and the deployed relay (`<base>/api/relay`):
 *   1. $1 withdrawn from each previous vault while its position is open — sponsored, so the relay's targets cover it;
 *   2. the ops settler cranks each position into its own vault once the Window settles (`Settled`, sent by the settler);
 *   3. what each holds is withdrawn, so both read zero.
 *
 * The owner's passkey secret is kept in the drive key folder (`KEY_DIR`, outside the repo) and printed as a path, so a
 * run cut short resumes with `--resume <file>`: it skips funding and booking and goes on waiting for the cranks.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/previous-vaults-live.ts [--base https://mitoshi.xyz] [--resume <file>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeFunctionData, erc20Abi, parseAbiItem, type Address, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import type { MarketId } from "@cwf/core";
import { createMarketsProvider, createSubmitterSession, FULL_TEMPO_CAPS, legacyVaultDeploymentsOf, nowSec, PATH_USD, readVaultSnapshot, sendBatch, vaultOutcomeId } from "@cwf/markets";
import { driveClient, newPasskeyRoot } from "@cwf/markets/drive";
import { fund, KEY_DIR, reader } from "./lib/actors";
import { label, liveWindows, testnetVenue } from "./lib/live-windows";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const BASE = arg("base", "https://mitoshi.xyz");
const RESUME = arg("resume", "");
const RELAY = `${BASE.replace(/\/+$/, "")}/api/relay`;
const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const ONE = 1_000_000n;
const out = (step: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A read that a dropped connection doesn't end: the run waits minutes on the chain, and one failed fetch is no verdict. */
async function patient<T>(read: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await read();
    } catch (error) {
      if (i >= tries) throw error;
      await sleep(3_000 * i);
    }
  }
}
const SETTLED = parseAbiItem("event Settled(address indexed owner, bytes32 indexed marketId, uint256 payout, uint256 yesRedeemed, uint256 noRedeemed, address by, uint64 atSec)");

const previous = legacyVaultDeploymentsOf(42431);
if (previous.length < 2) throw new Error(`expected the retired v2 and v1 as previous vaults, got ${previous.length}`);
out("vaults", { previous: previous.map((d) => ({ vault: d.eventVault, version: d.version })), relay: RELAY });

const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();

type Run = { secret: Hex; marketId: MarketId; expirySec: number; fromBlock: string };
let run: Run;
if (RESUME) {
  run = JSON.parse(readFileSync(RESUME, "utf8")) as Run;
  out("resume", { file: RESUME, marketId: run.marketId, expirySec: run.expirySec });
} else {
  // The quoted Window that locks soonest with room to book in it (both sides rest until lock − 75).
  let target: Awaited<ReturnType<typeof liveWindows>>[number] | undefined;
  for (const t0 = Date.now(); !target && Date.now() - t0 < 6 * 60_000; ) {
    target = (await liveWindows(ops, venue, nowSec())).filter((w) => w.market.lockAtSec - nowSec() > 110 && w.top.askLots > 0n).sort((a, b) => a.market.lockAtSec - b.market.lockAtSec)[0];
    if (!target) await sleep(10_000);
  }
  if (!target) throw new Error("no quoted Window with 110+ s to lock within 6 minutes");
  const fresh = newPasskeyRoot();
  run = { secret: fresh.secret, marketId: target.market.marketId as MarketId, expirySec: target.market.expirySec, fromBlock: String(await reader.getBlockNumber()) };
  mkdirSync(KEY_DIR, { recursive: true });
  const file = join(KEY_DIR, `previous-vaults-${fresh.address}.json`);
  writeFileSync(file, JSON.stringify(run), { mode: 0o600 });
  out("window", { window: label(target), marketId: run.marketId, lockInSec: target.market.lockAtSec - nowSec(), expirySec: run.expirySec, resume: file });
}
const { marketId } = run;
const reading = await provider.getMarket(marketId);
if (!reading.ok || !reading.value) throw new Error("the Window did not read");
const market = reading.value;

const root = newPasskeyRoot(run.secret);
const rootClient = driveClient(root.account as never, RELAY, RPC);
const owner = createSubmitterSession({ authority: "passkey", client: rootClient, caps: FULL_TEMPO_CAPS, nowSec }).submitter;
const receiptOf = async (hash: Hex) => {
  const r = (await patient(() => reader.getTransactionReceipt({ hash }))) as { status: string; blockNumber: bigint; from: Address; feePayer?: Address };
  return { status: r.status, block: r.blockNumber, feePayer: r.feePayer ?? null, sponsored: !!r.feePayer && r.feePayer.toLowerCase() !== root.address.toLowerCase() };
};
const selfPaid = async (calls: { to: Address; data: Hex }[]) => {
  const sent = await sendBatch(rootClient as never, { calls, sponsored: false, nonce: { kind: "expiring" }, nowSec: nowSec() });
  return { tx: sent.hash, ...(await receiptOf(sent.hash)) };
};
out("owner", { owner: root.address });
const fromBlock = BigInt(run.fromBlock);

if (!RESUME) {
  await fund(root.address);
  // Fund each previous vault and book $1 Up there (the owner's own `place`, self-paid).
  const lockAtSec = market.lockAtSec;
  for (const p of previous) {
    const vault = p.eventVault;
    const funded = await selfPaid([
      { to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, 3n * ONE] }) },
      { to: vault, data: encodeFunctionData({ abi: eventVaultAbi, functionName: "deposit", args: [3n * ONE] }) },
    ]);
    const quote = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: market.intervalSec }, "up", ONE);
    if (!quote.ok || !quote.value) throw new Error(`no quote: ${JSON.stringify(quote)}`);
    const booked = await selfPaid([{ to: vault, data: encodeFunctionData({ abi: eventVaultAbi, functionName: "place", args: [marketId, 0, true, quote.value.limitPriceRaw, quote.value.contractsRaw, BigInt(lockAtSec) * 1_000_000_000n] }) }]);
    const held = (await reader.readContract({ address: vault, abi: eventVaultAbi, functionName: "positionOf", args: [root.address, vaultOutcomeId(marketId, 0)] })) as bigint;
    out("funded-and-booked", { vault, version: p.version, deposit: funded, place: booked, upHeldRaw: held });
  }

  // 1. $1 out of each previous vault while its position is open, through the app's encoder and the deployed relay.
  for (const p of previous) {
    const r = await owner.submitTx({ kind: "vault-withdraw", amountBase: ONE, vault: p.eventVault });
    out("withdraw-open", { vault: p.eventVault, version: p.version, outcome: r.status, ...(r.status === "confirmed" ? { tx: r.txHash, ...(await receiptOf(r.txHash)) } : { detail: r }) });
  }
}

// 2. The settler cranks each position into its own vault once the Window settles.
const deadline = run.expirySec + 15 * 60;
const cranked = new Map<string, unknown>();
while (cranked.size < previous.length && nowSec() < deadline) {
  await sleep(15_000);
  for (const p of previous) {
    if (cranked.has(p.eventVault)) continue;
    const logs = await patient(() => reader.getLogs({ address: p.eventVault, event: SETTLED, args: { owner: root.address }, fromBlock }));
    const log = logs.find((l) => (l.args.marketId as string).toLowerCase() === marketId.toLowerCase());
    if (!log) continue;
    const tx = (await patient(() => reader.getTransaction({ hash: log.transactionHash! }))) as { from: Address };
    cranked.set(p.eventVault, { tx: log.transactionHash, block: log.blockNumber, payout: log.args.payout, by: log.args.by, sender: tx.from });
    out("cranked", { vault: p.eventVault, version: p.version, ...(cranked.get(p.eventVault) as object), afterExpirySec: nowSec() - run.expirySec });
  }
}
if (cranked.size < previous.length) out("crank-timeout", { cranked: [...cranked.keys()], waitedPastExpirySec: nowSec() - run.expirySec });

// 3. Whatever each holds now goes back to the account.
for (const p of previous) {
  const snap = (await readVaultSnapshot(root.address, p.eventVault))!;
  const free = snap.account.availableBase;
  if (free === 0n) { out("withdraw-rest", { vault: p.eventVault, free: 0n }); continue; }
  const r = await owner.submitTx({ kind: "vault-withdraw", amountBase: free, vault: p.eventVault });
  const after = (await readVaultSnapshot(root.address, p.eventVault))!.account.availableBase;
  out("withdraw-rest", { vault: p.eventVault, version: p.version, amount: free, outcome: r.status, ...(r.status === "confirmed" ? { tx: r.txHash, ...(await receiptOf(r.txHash)) } : { detail: r }), availableAfter: after });
}
out("done", { owner: root.address, marketId, cranked: cranked.size, of: previous.length });
process.exit(cranked.size === previous.length ? 0 : 1);
