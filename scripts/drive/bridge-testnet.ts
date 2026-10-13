/**
 * The S14 gate's money legs on testnet (R4-12, D-227; pillar2 B.6 `drive/bridge-testnet.ts`), through the same code
 * the app runs — `@cwf/markets/stocks` quotes, `bridgeInCalls` + `sendBridgeIn` (the write boundary) for the Robinhood
 * side, `encodeBridgeIntent` sent with `cast` for the Tempo side, `observeTransfer` + `@cwf/core` `advanceTransfer`
 * to follow each transfer leg by leg (LayerZero Scan + receipts):
 *
 *   1. in:  lock 1 faucet TSLA on Robinhood testnet → hop on Base → mint 1 bTSLA on Moderato (deployer → deployer)
 *   2. out: burn 1 bTSLA on Moderato → hop on Base → unlock 1 TSLA on Robinhood testnet
 *   3. deferral: a throwaway Moderato account blacklists the adapter in its receive policy, receives 1 bTSLA → the
 *      adapter defers it (RECEIVE_POLICY) → it unblocks → `claimDeferred` (skipped with `--no-deferral`)
 *   4. the reserves after, every check
 *
 * Every hash and LayerZero Scan link is printed as an acceptance row. It stops at step 0 — and says why — until the
 * Robinhood side is deployed (the deployer's test ETH, owner-actions S14c). Testnet only; keys from
 * `~/.config/cwf/testnet/` (never printed).
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/bridge-testnet.ts [--no-deferral]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createWalletClient, erc20Abi, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { advanceTransfer, layerZeroMessageUrl, reserveVerdict, type BridgeAdvance, type BridgeDirection, type LegRecord } from "@cwf/core";
import { robinhoodTestnet, tempoReadClient } from "@cwf/markets";
import { createdPolicyId, receivePolicyCalls } from "@cwf/markets/drive";
import { bridgeInCalls, bridgeTopology, encodeBridgeIntent, observeTransfer, quoteBridgeIn, quoteBridgeOut, readReserves, readRobinhoodHoldings, sendBridgeIn, sideClients, type BridgeClients } from "@cwf/markets/stocks";
import { castBatch } from "../lib/cast";
import { fund, wallet } from "./lib/actors";

const ONE_LD = 10n ** 18n;
const ONE_SD = 1_000_000n;
const POLL_MS = 10_000;
const GIVE_UP_MS = 45 * 60_000;
const rows: string[] = [];
const row = (step: string, evidence: string, result: string) => {
  const line = `| ${new Date().toISOString().slice(0, 16).replace("T", " ")} | ${step} | ${evidence} | ${result} |`;
  rows.push(line);
  console.log(line);
};

const deployerKey = (JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", "deployer.json"), "utf8")) as { privateKey: Hex }).privateKey;
const deployer = privateKeyToAccount(deployerKey);
const clients: BridgeClients = { network: "testnet", tempo: tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL), ...sideClients("testnet", { robinhood: process.env.RH_RPC_HTTP_URL, base: process.env.BASE_SEPOLIA_RPC_HTTP_URL }) };
const topo = bridgeTopology("testnet");
const tsla = topo.tickers.TSLA;

async function follow(direction: BridgeDirection, srcTx: Hex): Promise<BridgeAdvance> {
  const started = Date.now();
  let legs: LegRecord[] = [];
  let last = "";
  for (;;) {
    const obs = await observeTransfer(clients, { direction, ticker: "TSLA", srcTx });
    const next = advanceTransfer({ direction, network: "testnet", srcTx, legs, createdAtMs: started }, obs, null, Date.now());
    legs = next.legs;
    const said = `${next.phase} · ${legs.map((l) => `${l.status}${l.guid ? ` ${l.guid.slice(0, 10)}` : ""}`).join(" → ")}`;
    if (said !== last) console.log(`  [${Math.round((Date.now() - started) / 1000)} s] ${said}`);
    last = said;
    if (["delivered", "deferred", "released", "returned", "reverted", "failed"].includes(next.status)) return next;
    if (Date.now() - started > GIVE_UP_MS) throw new Error(`gave up after ${GIVE_UP_MS / 60_000} min: ${said}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

const legLinks = (a: BridgeAdvance) => a.legs.map((l) => (l.guid ? `[${l.guid.slice(0, 10)}…](${layerZeroMessageUrl(l.guid as Hex, "testnet")})` : "—")).join(" → ");

async function main() {
  // 0. Preflight: the Robinhood side must exist and the deployer must hold ETH and faucet TSLA there.
  if (!tsla.lockbox || !tsla.rhStock || !tsla.hopComposer || !tsla.adapter || !tsla.mirror) {
    console.log("Robinhood side not deployed (no 46630 stocks fragment): waits on the deployer's test ETH, owner-actions S14c.");
    process.exit(2);
  }
  const rh = await readRobinhoodHoldings(clients, "TSLA", deployer.address);
  if (!rh.ok) throw new Error(rh.error.technical);
  if (rh.value.eth === 0n || rh.value.stockLD < ONE_LD) {
    console.log(`Deployer on Robinhood testnet: ${rh.value.eth} wei, ${rh.value.stockLD} TSLA (18 dp) — needs ETH and ≥ 1 faucet TSLA.`);
    process.exit(2);
  }
  const mirrorOf = (a: Address) => clients.tempo.readContract({ address: tsla.mirror!, abi: erc20Abi, functionName: "balanceOf", args: [a] });

  // 1. In.
  const qIn = await quoteBridgeIn(clients, "TSLA", ONE_LD, deployer.address);
  if (!qIn.ok) throw new Error(`quote in: ${qIn.error.technical}`);
  const before = await mirrorOf(deployer.address);
  const rhWallet = createWalletClient({ account: deployer, chain: robinhoodTestnet, transport: http(process.env.RH_RPC_HTTP_URL) });
  const inTx = await sendBridgeIn(rhWallet, clients.robinhood, bridgeInCalls("TSLA", "testnet", qIn.value, deployer.address, rh.value.allowanceLD));
  console.log(`in: ${inTx} (fee ${qIn.value.nativeFee} wei)`);
  const inDone = await follow("in", inTx);
  const minted = (await mirrorOf(deployer.address)) - before;
  row("gate: lock → mint (via Base)", `RH lock \`${inTx}\`; legs ${legLinks(inDone)}; ${inDone.durationSec ?? "?"} s; bTSLA +${minted}`, inDone.status === "delivered" && minted === ONE_SD ? "pass" : `fail (${inDone.status})`);

  // 2. Out.
  const qOut = await quoteBridgeOut(clients, "TSLA", ONE_SD, deployer.address);
  if (!qOut.ok) throw new Error(`quote out: ${qOut.error.technical}`);
  const out = encodeBridgeIntent({ kind: "bridge-send", ticker: "TSLA", amountSD: ONE_SD, recipient: deployer.address, feeBase: qOut.value.nativeFee }, { chainId: 42431, wallet: deployer.address });
  if (!out?.ok) throw new Error("encode out failed");
  const outTx = castBatch(out.value.calls).transactionHash;
  console.log(`out: ${outTx} (fee ${qOut.value.nativeFee} LZD)`);
  const outDone = await follow("out", outTx);
  row("gate: burn → unlock (via Base)", `Tempo burn \`${outTx}\`; legs ${legLinks(outDone)}; ${outDone.durationSec ?? "?"} s`, outDone.status === "delivered" ? "pass" : `fail (${outDone.status})`);

  // 3. Deferral → claimDeferred.
  if (!process.argv.includes("--no-deferral")) {
    const held = wallet("bridge-held");
    await fund(held.address);
    const created = castBatch([receivePolicyCalls.createBlacklist(held.address, tsla.adapter)], { signer: { walletFile: held.file } });
    const policyId = createdPolicyId(created.logs);
    if (policyId === null) throw new Error("no policy created");
    castBatch([receivePolicyCalls.setReceivePolicy(policyId, held.address)], { signer: { walletFile: held.file } });
    const q = await quoteBridgeIn(clients, "TSLA", ONE_LD, held.address);
    if (!q.ok) throw new Error(`quote deferral: ${q.error.technical}`);
    const now = await readRobinhoodHoldings(clients, "TSLA", deployer.address);
    const allowance = now.ok ? now.value.allowanceLD : 0n;
    const dTx = await sendBridgeIn(rhWallet, clients.robinhood, bridgeInCalls("TSLA", "testnet", q.value, deployer.address, allowance));
    const dDone = await follow("in", dTx);
    const reason = dDone.legs.at(-1)?.deferReason ?? "none";
    row("gate: deferral (receive policy)", `RH lock \`${dTx}\` → ${held.address}; legs ${legLinks(dDone)}; reason ${reason}`, dDone.status === "deferred" && reason === "receive-policy" ? "pass" : `fail (${dDone.status}, ${reason})`);
    castBatch([receivePolicyCalls.unblock(policyId, tsla.adapter)], { signer: { walletFile: held.file } });
    const claim = encodeBridgeIntent({ kind: "bridge-claim-deferred", ticker: "TSLA" }, { chainId: 42431, wallet: held.address });
    if (!claim?.ok) throw new Error("encode claim failed");
    const c = castBatch(claim.value.calls, { signer: { walletFile: held.file } });
    const got = await mirrorOf(held.address);
    row("gate: claimDeferred", `\`${c.transactionHash}\` status ${c.status}; bTSLA ${got}`, got === ONE_SD ? "pass" : "fail");
    // The tracker reads the claim back: the held credit is empty again, so the transfer reads "released".
    const after = await follow("in", dTx);
    row("tracker after the claim", `${dTx}: ${after.status} · ${after.phase}`, after.status === "released" ? "pass" : `fail (${after.status})`);
  }

  // 4. Reserves after.
  const r = await readReserves(clients, {}, { fullIssuerScan: true });
  if (r.ok) {
    const t = r.value.tickers.find((x) => x.ticker === "TSLA")!;
    row("reserves after", `Tempo #${r.value.blocks.tempo} · RH #${r.value.blocks.robinhood}: locked ${t.check.locked} · on Tempo ${t.check.onTempo} · deferred ${t.check.deferred} · in flight ${t.check.inFlight}; ${t.check.checks.map((c) => `${c.id} ${c.status}`).join(", ")}`, reserveVerdict(r.value.tickers.map((x) => x.check)));
  }
  console.log(`\nAcceptance rows (docs/plan/acceptance/R4-12.md):\n${rows.join("\n")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message.replaceAll(deployerKey, "<redacted>") : error);
  process.exit(1);
});
