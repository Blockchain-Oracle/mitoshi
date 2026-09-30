/**
 * S7 off-chain half, live on Moderato: the Trading Balance through the production path — `@cwf/markets`' vault
 * encoders and order route, a passkey-shaped root (`fromHeadlessWebAuthn`, the WebAuthn envelope a real passkey signs)
 * and a browser-shaped session key (WebCrypto P-256, non-extractable, `Account.fromWebCryptoP256`) — every fill through
 * the production relay (`createRelayHandler`, in-process, testnet fee payer) with the vault policy's grant-sender rule.
 *
 *   root      arm: [approve(vault, 10), depositAndGrant(10, SESSION → key, 2/tap · 5/day · 3 Windows · ≤ 0.95, 6 h,
 *             budget 5)] — ONE self-paid tx (never sponsored)
 *   key       tap Up $1 and tap Down $1 through `submitOrder({ route: vault-grant })` — sponsored, no root signature
 *   key       a $3 tap is refused before anything is signed (per-tap cap $2): OverStakeCap, no tx, no relay call
 *   stranger  a foreign P-256 key's placeFor on this grant: the relay refuses `sender`; nothing is sponsored
 *   root      add to budget (fundGrant 2, self-paid) · extend (grant again, same key and caps, +24 h, the same budget:
 *             the contract returns the old budget and takes it back in one tx) · revoke (sponsored) · partial withdraw
 *             (sponsored, P12 pre-checked)
 * Liquidity: a throwaway maker rests PostOnly quotes inside the spread first (real orders; S3's book is thin).
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/vault-session.ts
 */
import { type Address, type Hex } from "viem";
import type { EventMarket, MarketId, Side, TxOutcome } from "@cwf/core";
import { createMarketsProvider, createSubmitterSession, FULL_TEMPO_CAPS, generateSessionKey, nowSec, placeForCall, readVaultSnapshot, sendBatch, sessionKeyAccount, sessionKeySession, vaultDeploymentOf, type MarketsSubmitter } from "@cwf/markets";
import { driveClient, newPasskeyRoot } from "@cwf/markets/drive";
import { fund, reader, restInside, wallet } from "./lib/actors";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows";
import { startLocalRelay } from "./lib/relay-server";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const ONE = 1_000_000n;
const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

const relay = await startLocalRelay();
const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();

const feePayerOf = async (hash: Hex) => {
  const r = (await reader.getTransactionReceipt({ hash })) as { feePayer?: Address; gasUsed: bigint; blockNumber: bigint; status: string };
  return { status: r.status, block: r.blockNumber, gasUsed: r.gasUsed, feePayer: r.feePayer, sponsored: r.feePayer?.toLowerCase() === relay.feePayer.toLowerCase() };
};
const hashOf = (o: TxOutcome) => (o.status === "confirmed" ? o.txHash : null);
const verdictsSince = (n: number) => relay.verdicts.slice(n).map((v) => `${v.method}:${v.verdict.ok ? "ok" : `${v.verdict.code} (${v.verdict.reason})`}`);

// 1. A live Window with room, and resting liquidity inside the spread.
const target = (await liveWindows(ops, venue, nowSec())).filter((w) => w.market.lockAtSec - nowSec() > 200)[0];
if (!target) throw new Error("no live Window with an open print and 200+ s to lock");
const marketId = target.market.marketId as MarketId;
const maker = wallet("s7-maker");
await fund(maker.address);
const rested = await restInside(maker, venue.engine, marketId, target.market.lockAtSec, { ask: 20_000n, bid: 20_000n }, () => rawTop(ops, venue, marketId));
out("setup", { window: label(target), marketId, maker: maker.address, makerTx: rested?.receipt.transactionHash ?? null, askYes: rested?.askYes, bidYes: rested?.bidYes });
await new Promise((r) => setTimeout(r, (target.series.minRestSec + 3) * 1000));
const marketReading = await provider.getMarket(marketId);
if (!marketReading.ok || !marketReading.value) throw new Error("the Window did not read");
const market: EventMarket = marketReading.value;

// 2. The owner arms: one self-paid transaction.
const root = newPasskeyRoot();
await fund(root.address);
const owner: MarketsSubmitter = createSubmitterSession({ authority: "passkey", client: driveClient(root.account as never, relay.url, RPC), caps: FULL_TEMPO_CAPS, nowSec }).submitter;
const key = await generateSessionKey(root.address);
const caps = { maxStakePerTradeBase: 2n * ONE, maxDailySpendBase: 5n * ONE, maxOpenPositions: 3, maxPriceRaw: 950_000n, market: null };
let v = relay.verdicts.length;
const arm = await owner.submitTx({ kind: "vault-deposit-and-grant", amountBase: 10n * ONE, terms: { kind: "session", actor: key.address, caps, expiresAtSec: nowSec() + 6 * 3600, budgetBase: 5n * ONE } });
if (arm.status !== "confirmed") throw new Error(`arm: ${JSON.stringify(arm)}`);
let snap = (await readVaultSnapshot(root.address))!;
const grantId = snap.grants.session!.grantId;
out("arm", { owner: root.address, key: key.address, keyIsP256: true, tx: arm.txHash, ...(await feePayerOf(arm.txHash)), grantId, available: snap.account.availableBase, budget: snap.grants.session!.budgetBase, relay: verdictsSince(v) });

// 3. Session taps: the key signs, the relay pays, no root signature.
const session = sessionKeySession({ record: key, network: "testnet", rpcHttpUrls: [RPC], relayUrl: relay.url, nowSec });
async function tap(side: Side, stakeBase: bigint, name: string) {
  const quote = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: market.intervalSec }, side, stakeBase);
  if (!quote.ok || !quote.value) return out(name, { error: "no quote", quote: quote.ok ? null : quote.error });
  const before = relay.verdicts.length;
  const t0 = Date.now();
  const r = await session.submitter.submitOrder({ market, side, stakeBase, displayedQuote: quote.value, wallet: session.address, route: { kind: "vault-grant", grantId } });
  const ms = Date.now() - t0;
  if (r.status === "confirmed") return out(name, { tx: r.booked.txHash, booked: r.booked, ms, ...(await feePayerOf(r.booked.txHash)), relay: verdictsSince(before) });
  return out(name, { outcome: r, ms, relay: verdictsSince(before) });
}
await tap("up", ONE, "tap-up");
await tap("down", ONE, "tap-down");
await tap("up", 3n * ONE, "tap-over-cap");

// 4. A stranger's P-256 key on this live grant: our lane refuses it before signing (NotGrantActor), and the relay —
//    asked directly with the stranger as sender, the fill a hostile client would send — refuses `sender`.
const strangerKey = await generateSessionKey(root.address);
const stranger = sessionKeySession({ record: strangerKey, network: "testnet", rpcHttpUrls: [RPC], relayUrl: relay.url, nowSec });
await (async () => {
  const quote = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: market.intervalSec }, "up", ONE);
  if (!quote.ok || !quote.value) return out("stranger", { error: "no quote" });
  let before = relay.verdicts.length;
  const r = await stranger.submitter.submitOrder({ market, side: "up", stakeBase: ONE, displayedQuote: quote.value, wallet: stranger.address, route: { kind: "vault-grant", grantId } });
  out("stranger-lane", { outcome: r, relay: verdictsSince(before) });
  before = relay.verdicts.length;
  const call = placeForCall(vaultDeploymentOf(42431)!.eventVault, { grantId, marketId, outcomeIdx: 0, isBuy: true, priceRaw: quote.value.limitPriceRaw, quantityRaw: quote.value.contractsRaw, expireNs: BigInt(target.market.lockAtSec) * 1_000_000_000n });
  try {
    const sent = await sendBatch(driveClient(sessionKeyAccount(strangerKey) as never, relay.url, RPC), { calls: [call], sponsored: true, nonce: { kind: "expiring" }, nowSec: nowSec() });
    out("stranger-relay", { unexpected: "sent", tx: sent.hash, ...(await feePayerOf(sent.hash)), relay: verdictsSince(before) });
  } catch (error) {
    out("stranger-relay", { sent: false, error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 160), relay: verdictsSince(before) });
  }
})();

// 5. Add to budget, extend, revoke, partial withdraw.
snap = (await readVaultSnapshot(root.address))!;
out("after-taps", { available: snap.account.availableBase, budget: snap.grants.session?.budgetBase, spentToday: snap.grants.session?.spentTodayBase, openPositions: snap.grants.session?.openPositions });
v = relay.verdicts.length;
const add = await owner.submitTx({ kind: "vault-fund-grant", grantId, amountBase: 2n * ONE });
out("add-to-budget", { outcome: add.status, tx: hashOf(add), ...(hashOf(add) ? await feePayerOf(hashOf(add)!) : {}), relay: verdictsSince(v) });
snap = (await readVaultSnapshot(root.address))!;
const live = snap.grants.session!;
v = relay.verdicts.length;
const extend = await owner.submitTx({ kind: "vault-grant", terms: { kind: "session", actor: key.address, caps: live.caps, expiresAtSec: live.expiresAtSec + 24 * 3600, budgetBase: live.budgetBase } });
snap = (await readVaultSnapshot(root.address))!;
out("extend", { outcome: extend.status, tx: hashOf(extend), ...(hashOf(extend) ? await feePayerOf(hashOf(extend)!) : {}), oldGrant: grantId, newGrant: snap.grants.session?.grantId, expiresAtSec: snap.grants.session?.expiresAtSec, budget: snap.grants.session?.budgetBase, relay: verdictsSince(v) });
const extended = snap.grants.session!;
await tap("up", ONE, "tap-after-extend-old-grant-id").catch((e) => out("tap-after-extend-old-grant-id", { error: String(e) }));
v = relay.verdicts.length;
const revoke = await owner.submitTx({ kind: "vault-revoke", grantId: extended.grantId });
snap = (await readVaultSnapshot(root.address))!;
out("revoke", { outcome: revoke.status, tx: hashOf(revoke), ...(hashOf(revoke) ? await feePayerOf(hashOf(revoke)!) : {}), available: snap.account.availableBase, session: snap.grants.session, relay: verdictsSince(v) });
const half = snap.account.availableBase / 2n;
v = relay.verdicts.length;
const withdraw = await owner.submitTx({ kind: "vault-withdraw", amountBase: half });
snap = (await readVaultSnapshot(root.address))!;
out("partial-withdraw", { outcome: withdraw.status, amount: half, tx: hashOf(withdraw), ...(hashOf(withdraw) ? await feePayerOf(hashOf(withdraw)!) : {}), availableAfter: snap.account.availableBase, relay: verdictsSince(v) });
out("done", { owner: root.address, key: key.address, marketId, expirySec: target.market.expirySec, note: "the settler cranks this owner once S3 settles the Window" });
await relay.close();
process.exit(0);
