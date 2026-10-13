/**
 * R6 liveness drive (D-230 items 1–3), run by the ship step against the deployed site: a fresh test account takes a $5
 * UP on a BTC and a SOL 5-minute Window, each fills, each Window settles, and the Window's countdown is right while its
 * opening print lands. The browser half is `web/e2e/r6-liveness.ts` (a virtual passkey on a phone-width terminal); this
 * half reads the chain: every transaction the app sent has a successful receipt, each fill names its Window, each Window
 * resolves (its prints in, settled by ops), and the account is paid or told it lost (`Redeemed` from the settler after
 * the claim grace, or no position left to pay). One JSON object a line; exit 1 on any miss.
 *
 *   tsx scripts/drive/r6-liveness.ts --base https://mitoshi.xyz [--out <dir>] [--settle-wait-min 14]
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeEventLog, getAbiItem, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { createOpsClient, fetchMarkets, venueOf } from "@cwf/markets/ops";

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const base = arg("base", "https://mitoshi.xyz");
const out = arg("out", join(process.cwd(), "r6-liveness-out"));
const settleWaitMs = Number(arg("settle-wait-min", "14")) * 60_000;
const web = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web");
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

// 1. The browser half: sign-up, the countdown watch and the two taps.
const lines: Record<string, unknown>[] = [];
const browserOk = await new Promise<boolean>((resolve) => {
  const child = spawn("pnpm", ["exec", "tsx", "e2e/r6-liveness.ts", "--base", base, "--out", out], { cwd: web, stdio: ["ignore", "pipe", "inherit"] });
  let buf = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      console.log(line);
      try {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // a non-JSON line from the browser half
      }
    }
  });
  child.on("close", (code) => resolve(code === 0));
});
const done = lines.find((l) => l.step === "done") as { txs?: string[] } | undefined;
const txs = (done?.txs ?? []) as Hex[];

// 2. The chain: receipts, fills, settlement, payment.
const client = createOpsClient({ network: "testnet", rpcUrl: process.env.TEMPO_RPC_HTTP_URL });
const venue = venueOf(client.chainId);
if (!venue) throw new Error("engine not deployed on Moderato");
const EXECUTED = getAbiItem({ abi: eventsEngineAbi, name: "OrderExecuted" });
const REDEEMED = getAbiItem({ abi: eventsEngineAbi, name: "Redeemed" });
const fills: { tx: Hex; market: Hex; taker: Hex; filledLots: bigint; cashSpent: bigint; block: bigint }[] = [];
let receiptsOk = txs.length > 0;
for (const hash of txs) {
  const r = await client.public.getTransactionReceipt({ hash });
  if (r.status !== "success") receiptsOk = false;
  for (const l of r.logs) {
    if (l.address.toLowerCase() !== venue.engine.toLowerCase()) continue;
    try {
      const e = decodeEventLog({ abi: [EXECUTED], data: l.data, topics: l.topics });
      const res = e.args.result as { filledLots: bigint; cashSpent: bigint };
      if (res.filledLots > 0n) fills.push({ tx: hash, market: e.args.marketId as Hex, taker: e.args.taker as Hex, filledLots: res.filledLots, cashSpent: res.cashSpent, block: r.blockNumber });
    } catch {
      // another engine event
    }
  }
  log({ step: "receipt", hash, status: r.status, block: r.blockNumber.toString() });
}
log({ step: "fills", n: fills.length, fills: fills.map((f) => ({ tx: f.tx, market: f.market, taker: f.taker, lots: f.filledLots.toString(), spentBase: f.cashSpent.toString() })) });

const deadline = Date.now() + settleWaitMs;
const settled: Record<string, unknown>[] = [];
for (const f of fills) {
  let state = 0;
  let view: Awaited<ReturnType<typeof fetchMarkets>>[number] | undefined;
  while (Date.now() < deadline) {
    [view] = await fetchMarkets(client, venue, [f.market]);
    state = view?.state ?? 0;
    if (state !== 0) break;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  // Paid: the settler's `redeemFor` after the claim grace (or the user's own redeem), a Redeemed log for this holder.
  let paid: { tx: Hex; totalBase: string } | null = null;
  while (state !== 0 && !paid && Date.now() < deadline) {
    const logs = await client.public.getLogs({ address: venue.engine, event: REDEEMED, args: { marketId: f.market, holder: f.taker }, fromBlock: f.block, toBlock: "latest" });
    if (logs[0]) paid = { tx: logs[0].transactionHash as Hex, totalBase: String(logs[0].args.total) };
    else await new Promise((r) => setTimeout(r, 20_000));
  }
  const row = { step: "settled", market: f.market, state: ["open", "resolved", "voided"][state] ?? String(state), won: view && state === 1 ? (view.payoutYes > 0 ? "UP" : "DOWN") : null, openPrint: view?.prints.open.source ? String(view.prints.open.priceE8) : null, closePrint: view?.prints.close.source ? String(view.prints.close.priceE8) : null, paid };
  settled.push(row);
  log(row);
}

const watches = lines.filter((l) => l.step === "open-watch");
const taps = lines.filter((l) => l.step === "tap");
const ok = browserOk && receiptsOk && fills.length >= 2 && settled.length >= 2 && settled.every((s) => s.state !== "open" && s.paid !== null) && watches.every((w) => w.countdownRight === true);
log({ step: "summary", ok, browserOk, receiptsOk, fills: fills.length, settled: settled.map((s) => `${String(s.market).slice(0, 10)} ${s.state}${s.paid ? " paid" : ""}`), countdown: watches.map((w) => `${w.symbol}: ${w.countdownRight ? "right" : "WRONG"}, UP after ${w.enterableAfterSec} s`), taps: taps.map((t) => `${t.symbol}: ${t.opened ? "opened" : "NOT opened"} in ${t.pressToToastMs} ms`) });
process.exit(ok ? 0 : 1);
