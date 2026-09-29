/**
 * S2.12 live drive on Moderato: one real 5-minute BTC Window end to end on the deployed engine, every step a real
 * Tempo transaction signed by its testnet role key (keys never printed; `scripts/lib/cast.ts`).
 *
 *   roller      openWindow on BTC-5m, ETH-5m, SOL-5m (the next 5-minute boundary T)
 *   seed-maker  pre-open PostOnly quotes (D-088): BUY_YES 500 and BUY_NO 520 (a YES ask), 2,000 lots each
 *   price-relay recordPrint(open) with the real RedStone packages signed at T (gateway historical endpoint)
 *   keeper      IOC BUY_YES 530 × 1,000 → fills the maker's ask (MINT_PAIR)
 *   desk        IOC BUY_NO at 500 × 1,000 → fills the maker's bid (MINT_PAIR) and mints 1,000 sets (so it is owed a payout
 *               whichever side wins), then sets a receive policy that refuses all senders
 *   price-relay recordPrint(close) at T + 300; settler settles, cranks redeemFor(keeper) (paid) and redeemFor(desk)
 *               (held as credit: P12); seed-maker redeems its own position (drains its remaining quotes, T05);
 *   desk        clears its policy and withdraws the held credit.
 * Writes every tx hash + receipt to stdout as JSON lines and the RedStone payloads to contracts/test/fixtures/prints/.
 *
 *   pnpm --dir scripts exec tsx drive/engine-live.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, type Hex, createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, keccak256, encodeAbiParameters } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { PATH_USD, type CastReceipt, castSend } from "../lib/cast.js";
import { loadRole } from "../v4/lib.js";
import { packagesAt, parseGatewayJson, redstoneHistoricalUrl, redstoneMedianE8, redstonePayload, decimalToE8, toHex } from "./lib/redstone-payload.js";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const venue = (deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }>; params: Record<string, string> }>>)["42431"]!.engine!;
const ENGINE = getAddress(venue.contracts.EventsEngine!.address);
const LENS = getAddress(venue.contracts.EngineLens!.address);
const SERIES = { BTC: venue.params["series.BTC-5m"] as Hex, ETH: venue.params["series.ETH-5m"] as Hex, SOL: venue.params["series.SOL-5m"] as Hex };
const TIP403: Address = "0x403c000000000000000000000000000000000000";
const FIXTURES = join(import.meta.dirname, "..", "..", "contracts", "test", "fixtures", "prints");

const log = (step: string, r: CastReceipt | Record<string, unknown>) => console.log(JSON.stringify({ step, ...r, logs: undefined }));
const sleepUntil = async (unixSec: number) => {
  while (Date.now() / 1000 < unixSec) await new Promise((res) => setTimeout(res, 1_000));
};
const engineCall = (fn: string, args: unknown[]) => encodeFunctionData({ abi: eventsEngineAbi, functionName: fn as never, args: args as never });
const send = (role: string, to: Address, data: Hex, step: string) => {
  const r = castSend([to, data], { signer: { role }, rpc: RPC });
  if (r.status !== "0x1" && r.status !== "1") throw new Error(`${step} failed: ${r.transactionHash}`);
  log(step, { tx: r.transactionHash, block: Number(r.blockNumber), gasUsed: Number(r.gasUsed), status: r.status });
  return r;
};

/** The real RedStone `feed` packages signed at exactly `tSec`, waiting for all five signers (strict window). */
async function redstoneAt(feed: string, tSec: number): Promise<Hex> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch(redstoneHistoricalUrl(tSec), { signal: AbortSignal.timeout(20_000) });
    if (res.status === 200) {
      const pkgs = packagesAt(parseGatewayJson(await res.text()), feed, tSec * 1000);
      if (pkgs.length >= 5) {
        const payload = redstonePayload(pkgs, feed);
        const values = pkgs.map((p) => decimalToE8(String(p.dataPoints[0]!.value)));
        const base = join(FIXTURES, `redstone-${feed.toLowerCase()}-${tSec}`);
        writeFileSync(`${base}.hex`, toHex(payload).slice(2) + "\n");
        writeFileSync(`${base}.json`, JSON.stringify({ feed, T: tSec, signers: pkgs.map((p) => p.signerAddress), valuesE8: values.map(String), medianE8: String(redstoneMedianE8(values)), payloadBytes: payload.length }, null, 2) + "\n");
        log("redstone-fetched", { feed, T: tSec, signers: pkgs.length, medianE8: String(redstoneMedianE8(values)) });
        return toHex(payload);
      }
    }
    await new Promise((res) => setTimeout(res, 3_000));
  }
  throw new Error(`no 5-signer ${feed} packages at ${tSec}`);
}

const marketId = (seriesId: Hex, index: bigint) => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint64" }], [seriesId, index]));

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const T = Math.ceil((now + 90) / 300) * 300;
  const lock = T + 300;
  log("plan", { T, lock, engine: ENGINE });

  // 1. The roller lists the next Window on each Series.
  const markets: Record<string, Hex> = {};
  for (const [sym, sid] of Object.entries(SERIES)) {
    const series = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "seriesOf", args: [sid] })) as { nextIndex: bigint };
    const index = series.nextIndex;
    send("roller", ENGINE, engineCall("openWindow", [{ seriesId: sid, index, tradingStart: T, lockAt: lock, expiry: lock, openKind: 0, closeKind: 0 }]), `openWindow-${sym}`);
    markets[sym] = marketId(sid, index);
  }
  const m = markets.BTC!;
  log("markets", markets);

  // 2. Approvals and pre-open PostOnly quotes (Listed status: PostOnly only).
  for (const role of ["seed-maker", "keeper", "desk"]) {
    send(role, PATH_USD, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ENGINE, 2n ** 256n - 1n] }), `approve-${role}`);
  }
  const order = (kind: number, orderType: number, price: number, lots: bigint, expireTs: number) => ({
    marketId: m, kind, orderType, selfMatch: 0, priceTicks: price, lots, expireTs, maxFills: 16, maxEvictions: 16, useCredit: false, withdrawProceeds: false, clientId: 0n,
  });
  send("seed-maker", ENGINE, engineCall("placeOrder", [order(0, 3, 500, 2_000n, lock)]), "maker-postOnly-BUY_YES-500");
  send("seed-maker", ENGINE, engineCall("placeOrder", [order(2, 3, 520, 2_000n, lock)]), "maker-postOnly-BUY_NO-520");

  // 3. The open print at T (real RedStone packages, all five signers inside the strict window).
  await sleepUntil(T + 15);
  const openPayload = await redstoneAt("BTC", T);
  send("price-relay", ENGINE, engineCall("recordPrint", [m, 0, openPayload]), "recordPrint-open");

  // 4. Takers: MINT_PAIR against the ask and against the bid; the desk also mints sets, then refuses all senders.
  send("keeper", ENGINE, engineCall("placeOrder", [order(0, 2, 530, 1_000n, lock)]), "taker-IOC-BUY_YES-530");
  send("desk", ENGINE, engineCall("placeOrder", [order(2, 2, 500, 1_000n, lock)]), "taker-IOC-BUY_NO-500");
  send("desk", ENGINE, engineCall("mintSet", [m, 1_000n, false]), "desk-mintSet-1000");
  send("desk", TIP403, encodeFunctionData({ abi: [{ type: "function", name: "setReceivePolicy", stateMutability: "nonpayable", inputs: [{ type: "uint64" }, { type: "uint64" }, { type: "address" }], outputs: [] }], functionName: "setReceivePolicy", args: [0n, 1n, getAddress(loadRole("desk").address)] }), "desk-receivePolicy-rejectAll");

  // 5. Close print at T + 300, settle, cranks and own redeem.
  await sleepUntil(lock + 15);
  const closePayload = await redstoneAt("BTC", lock);
  send("price-relay", ENGINE, engineCall("recordPrint", [m, 1, closePayload]), "recordPrint-close");
  send("settler", ENGINE, engineCall("settle", [m]), "settle");
  const ref = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketRef", args: [m] });
  log("resolved", { ref: JSON.parse(JSON.stringify(ref, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) });
  send("settler", ENGINE, engineCall("redeemFor", [m, getAddress(loadRole("keeper").address)]), "redeemFor-keeper");
  send("settler", ENGINE, engineCall("redeemFor", [m, getAddress(loadRole("desk").address)]), "redeemFor-desk-held");
  const deskCredit = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "creditOf", args: [m, getAddress(loadRole("desk").address)] })) as bigint;
  log("desk-held-credit", { credit: deskCredit.toString() });
  send("seed-maker", ENGINE, engineCall("redeem", [m]), "maker-redeem-drains");

  // 6. The desk clears its policy and takes the held credit (if its side won anything).
  send("desk", TIP403, encodeFunctionData({ abi: [{ type: "function", name: "setReceivePolicy", stateMutability: "nonpayable", inputs: [{ type: "uint64" }, { type: "uint64" }, { type: "address" }], outputs: [] }], functionName: "setReceivePolicy", args: [1n, 1n, getAddress(loadRole("desk").address)] }), "desk-receivePolicy-allowAll");
  if (deskCredit > 0n) send("desk", ENGINE, engineCall("withdrawCredit", [m, deskCredit]), "desk-withdrawCredit");
  const owed = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "config" })) as { totalOwed: bigint };
  log("done", { totalOwed: owed.totalOwed.toString() });
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
