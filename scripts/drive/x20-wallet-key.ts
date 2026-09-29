/**
 * Spike X20 (S4, D-047, Q-031): wallet mode on Moderato against a live S3 Window, through the production relay
 * (in-process `createRelayHandler`, engine policy registered) and the production order lane (`submitOrder`).
 *
 *   1. a passkey-shaped root (headless WebAuthn P-256) is funded by the faucet;
 *   2. the root signs a TIP-1011 authorization for a non-extractable WebCrypto P-256 key: scopes = engine
 *      placeOrder/cancelOrders/redeem/withdrawCredit + pathUSD.approve(engine), limit = $25 pathUSD per 24 h, expiry 24 h;
 *   3. ten taps `[approve exact, placeOrder IOC]` signed by the key with no root signature (the first publishes the
 *      authorization), each sponsored by the relay;
 *   4. the eleventh tap is refused by the key's daily limit;
 *   5. out-of-scope calls are refused (a transfer, an approve to another spender, `mintSet`);
 *   6. the key is listed with its remaining limit (the `/settings/account` pipeline), revoked by the root (sponsored
 *      keys policy), and a tap after revocation is refused.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/x20-wallet-key.ts
 * Prints one JSON line per step; private keys never leave the process.
 */
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { createMarketsProvider, createSubmitterSession, foldKeychain, FULL_TEMPO_CAPS, nowSec, PATH_USD, readKeyStates, scanKeychain, sendBatch, walletKeyAuthorization, withAuthorizedLimits } from "@cwf/markets";
import type { MarketId } from "@cwf/core";
import { driveClient, newPasskeyRoot, newWalletModeKey, signWalletKeyAuthorization } from "@cwf/markets/drive";
import { balanceOf, fund, insideQuotes, reader, restQuotes, wallet } from "./lib/actors";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows";
import { startLocalRelay } from "./lib/relay-server";

const STAKE = BigInt(process.env.X20_STAKE ?? 2_400_000); // $2.40 a tap: ten fit under $25, the eleventh does not
const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

const relay = await startLocalRelay();
const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();

// A live Window with its opening print and at least ~4 minutes to lock.
const windows = (await liveWindows(ops, venue, nowSec())).filter((w) => w.market.lockAtSec - nowSec() > 240);
const target = windows[0];
if (!target) throw new Error("no live Window with an open print and 4+ minutes to lock right now");
const marketId = target.market.marketId as MarketId;
out("window", { window: label(target), marketId, lockAtSec: target.market.lockAtSec, top: target.top });

// Liquidity: a throwaway maker rests YES asks (BUY_NO) and YES bids so the ten taps have size to take.
const maker = wallet("x20-maker");
await fund(maker.address);
const { askYes, bidYes } = insideQuotes(await rawTop(ops, venue, marketId));
const quotes = restQuotes(maker, venue.engine, marketId, target.market.lockAtSec, [
  { kind: 2, yesTicks: askYes, lots: 80_000n },
  { kind: 0, yesTicks: bidYes, lots: 20_000n },
]);
out("maker-quotes", { maker: maker.address, tx: quotes.transactionHash, gasUsed: quotes.gasUsed });
await new Promise((r) => setTimeout(r, (target.series.minRestSec + 3) * 1000));

// Root + key; the root is funded by the faucet (the D-046 ceremony's server faucet).
const root = newPasskeyRoot();
const fundTxs = await fund(root.address);
const key = await newWalletModeKey(root.address);
const auth = walletKeyAuthorization({ engine: venue.engine, pathUsd: PATH_USD, nowSec: nowSec() });
const pending = { current: await signWalletKeyAuthorization(root, key, auth) as unknown };
out("authorize", { root: root.address, keyId: key.keyId, faucetTxs: fundTxs, expirySec: auth["expiry"], limit: auth.limits[0], scopes: auth.scopes });

const keyClient = driveClient(key.account as never, relay.url);
const session = createSubmitterSession({ authority: "access-key", client: keyClient, caps: FULL_TEMPO_CAPS, nowSec, pendingKeyAuthorization: pending });
const market = (await provider.getMarket(marketId));
if (!market.ok || !market.value) throw new Error("the Window did not read");

const remaining = async () => {
  const [state] = await readKeyStates(reader as never, root.address, [{ keyId: key.keyId, admin: false, signatureType: 1, expirySec: null, authorized: null, revoked: null, lastUsed: null, tokens: [{ token: PATH_USD, limit: auth.limits[0]!.limit, period: 86_400n }] }]);
  return state?.tokens[0]?.remaining ?? null;
};

async function tap(n: number) {
  const q = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: market.ok ? market.value!.intervalSec : 0 }, "up", STAKE);
  if (!q.ok || !q.value) return out(`tap-${n}`, { quote: q.ok ? null : q.error });
  const startedMs = Date.now();
  const outcome = await session.submitter.submitOrder({ market: market.ok ? market.value! : (null as never), side: "up", stakeBase: STAKE, displayedQuote: q.value, wallet: root.address });
  const ms = Date.now() - startedMs;
  if (outcome.status === "confirmed") {
    const receipt = await reader.getTransactionReceipt({ hash: outcome.booked.txHash });
    const tx = await reader.getTransaction({ hash: outcome.booked.txHash });
    out(`tap-${n}`, {
      status: outcome.status, tx: outcome.booked.txHash, ms, contractsRaw: outcome.booked.contractsRaw, costBase: outcome.booked.costBase, maxCostBase: q.value.maxCostBase,
      gasUsed: receipt.gasUsed, feePayer: (receipt as { feePayer?: string }).feePayer, from: receipt.from, keyAuthorization: Boolean((tx as { keyAuthorization?: unknown }).keyAuthorization),
      remaining: await remaining(),
    });
  } else out(`tap-${n}`, { status: outcome.status, ms, diagnosis: "diagnosis" in outcome ? { kind: outcome.diagnosis.kind, errorName: outcome.diagnosis.errorName, technical: outcome.diagnosis.technical.slice(0, 240) } : null, remaining: await remaining() });
  return outcome;
}

for (let n = 1; n <= 11; n++) await tap(n);

// Out-of-scope calls signed by the key (each also asks the relay to pay; the verdict log shows the relay's own answer).
const attempts: [string, { to: Address; data: Hex }][] = [
  ["pathUSD.transfer", { to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [maker.address, 1n] }) }],
  ["pathUSD.approve(maker)", { to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [maker.address, 1n] }) }],
  ["engine.mintSet", { to: venue.engine, data: encodeFunctionData({ abi: eventsEngineAbi, functionName: "mintSet", args: [marketId, 1000n, false] }) }],
];
for (const [name, call] of attempts) {
  const before = relay.verdicts.length;
  try {
    const sent = await sendBatch(keyClient, { calls: [call], sponsored: true, nonce: { kind: "expiring" }, nowSec: nowSec() });
    out("out-of-scope", { name, LEAKED: sent.hash, status: sent.receipt.status });
  } catch (error) {
    const verdicts = relay.verdicts.slice(before).map((v) => (v.verdict.ok ? "ok" : v.verdict.code));
    out("out-of-scope", { name, refused: true, relay: verdicts, chain: (error instanceof Error ? error.message : String(error)).split("\n").find((l) => /CallNotAllowed|Details|reverted|allowed|scope/i.test(l))?.slice(0, 200) });
  }
}

// The /settings/account pipeline: keychain events → fold → authorised limits → live state.
const head = await reader.getBlockNumber();
const events = await scanKeychain(reader as never, root.address, head - 5_000n, head);
const listed = await readKeyStates(reader as never, root.address, await withAuthorizedLimits(reader as never, foldKeychain(events)));
out("listed", { keys: listed.map((k) => ({ keyId: k.keyId, revoked: k.live?.revoked, expirySec: k.live?.expirySec, tokens: k.tokens, authorized: k.authorized?.txHash, lastUsed: k.lastUsed?.txHash })) });

// Revoke with the root (one passkey signature; sponsored by the keys policy), then the key must be refused.
const rootSession = createSubmitterSession({ authority: "passkey", client: driveClient(root.account as never, relay.url), caps: FULL_TEMPO_CAPS, nowSec });
const revoked = await rootSession.submitter.submitTx({ kind: "key-revoke", keyIds: [key.keyId] });
out("revoke", revoked.status === "confirmed" ? { status: revoked.status, tx: revoked.txHash, feePayer: ((await reader.getTransactionReceipt({ hash: revoked.txHash })) as { feePayer?: string }).feePayer } : { status: revoked.status, diagnosis: revoked.diagnosis });
await tap(12);

out("summary", {
  relayFeePayer: relay.feePayer,
  rootBalance: await balanceOf(root.address),
  verdicts: relay.verdicts.map((v) => ({ method: v.method, ok: v.verdict.ok, code: v.verdict.ok ? null : v.verdict.code, reason: v.verdict.ok ? null : v.verdict.reason })),
});
await relay.close();
process.exit(0);
