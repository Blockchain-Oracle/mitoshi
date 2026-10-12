#!/usr/bin/env -S pnpm exec tsx
/**
 * R4-1 (D-227) live proof of the Trading Balance's cost basis on Moderato: a passkey-shaped root arms a session on the
 * current Trading Balance; its session key taps Up twice through the relay (the terminal's one-tap: `submitOrder`,
 * `vault-grant`), closes part with the terminal's Close (`submitCashOut` on the same route) and taps again (a re-entry).
 * Then the app's read
 * (`listVaultBets`: the tally, and — once something was sold — the vault's own `Executed` fills replayed at average
 * cost) is checked against the chain: the three receipts' booked contracts and cash, the vault's `positionOf`.
 *   open cost = (cost₁ + cost₂) × (bought − sold) ÷ bought + cost₃     (the sale took its share out, average cost)
 *   the old figure was cost − proceeds (net), which counted the sale's profit or loss as the rest's.
 * Throwaway root and key (never printed); fees are the relay's (sponsored) or the root's own.
 *
 *   pnpm --dir scripts exec tsx drive/pnl-vault-live.ts
 */
import { replayVaultCost, type EventMarket, type MarketId, type Side } from "@cwf/core";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { createMarketsProvider, createSubmitterSession, FULL_TEMPO_CAPS, generateSessionKey, listVaultBets, nowSec, sessionKeySession, vaultDeploymentOf, vaultOutcomeId } from "@cwf/markets";
import { driveClient, newPasskeyRoot } from "@cwf/markets/drive";
import { fund, reader } from "./lib/actors";
import { label, liveWindows, testnetVenue } from "./lib/live-windows";
import { startLocalRelay } from "./lib/relay-server";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const ONE = 1_000_000n;
const out = (step: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, atSec: nowSec(), ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const relay = await startLocalRelay();
const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();
const v2 = vaultDeploymentOf(42431)!;

// A quoted Window with time to tap twice, sell and read (most time left first).
let target: Awaited<ReturnType<typeof liveWindows>>[number] | undefined;
for (const t0 = Date.now(); !target && Date.now() - t0 < 6 * 60_000; ) {
  target = (await liveWindows(ops, venue, nowSec())).filter((w) => w.market.lockAtSec - nowSec() > 180 && w.top.bidLots > 0n && w.top.askLots > 0n)[0];
  if (!target) await sleep(15_000);
}
if (!target) throw new Error("no quoted Window with 180 s to lock");
const marketId = target.market.marketId as MarketId;
const reading = await provider.getMarket(marketId);
if (!reading.ok || !reading.value) throw new Error("the Window did not read");
const market: EventMarket = reading.value;
out("window", { window: label(target), marketId, lockInSec: target.market.lockAtSec - nowSec(), vault: v2.eventVault });

// The owner arms (one self-paid tx): $10 in, a session grant to the key.
const root = newPasskeyRoot();
await fund(root.address);
const rootClient = driveClient(root.account as never, relay.url, RPC);
const owner = createSubmitterSession({ authority: "passkey", client: rootClient, caps: FULL_TEMPO_CAPS, nowSec }).submitter;
const key = await generateSessionKey(root.address);
const caps = { maxStakePerTradeBase: 2n * ONE, maxDailySpendBase: 5n * ONE, maxOpenPositions: 3, maxPriceRaw: 950_000n, market: null };
const arm = await owner.submitTx({ kind: "vault-deposit-and-grant", amountBase: 10n * ONE, terms: { kind: "session", actor: key.address, caps, expiresAtSec: nowSec() + 6 * 3600, budgetBase: 5n * ONE } });
if (arm.status !== "confirmed") throw new Error(`arm: ${JSON.stringify(arm)}`);
const vault = { address: v2.eventVault, abi: eventVaultV2Abi } as const;
const grantId = (await reader.readContract({ ...vault, functionName: "activeGrantOf", args: [root.address, 0] })) as bigint;
out("armed", { owner: root.address, armTx: arm.txHash, grantId });

const session = sessionKeySession({ record: key, network: "testnet", rpcHttpUrls: [RPC], relayUrl: relay.url, nowSec });
const route = { kind: "vault-grant" as const, grantId };
async function tap(side: Side, stakeBase: bigint) {
  const quote = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: market.intervalSec }, side, stakeBase);
  if (!quote.ok || !quote.value) throw new Error(`no ${side} quote`);
  const r = await session.submitter.submitOrder({ market, side, stakeBase, displayedQuote: quote.value, wallet: session.address, route });
  if (r.status !== "confirmed") throw new Error(`${side} tap: ${JSON.stringify(r)}`);
  out(`tap-${side}`, { tx: r.booked.txHash, contractsRaw: r.booked.contractsRaw, costBase: r.booked.costBase });
  return r.booked;
}
const a = await tap("up", ONE);
const b = await tap("up", (3n * ONE) / 2n);
const bought = a.contractsRaw + b.contractsRaw;
const cost = a.costBase + b.costBase;

// The terminal's Close for a part: a fresh exit for that size, its floor less the default 1 % tolerance.
const lot = target.series.lotBase;
const part = ((bought / 3n) / lot) * lot;
const exit = await provider.freshExitQuote({ marketId, decimals: 6 }, "up", part);
if (!exit.ok || !exit.value) throw new Error("no exit for the part");
const sold = await session.submitter.submitCashOut({ market, side: "up", contractsRaw: exit.value.contractsRaw, displayedExit: { ...exit.value, minProceedsBase: (exit.value.minProceedsBase * 9_900n) / 10_000n }, wallet: session.address, route });
if (sold.status !== "confirmed") throw new Error(`close: ${JSON.stringify(sold)}`);
out("close-part", { tx: sold.booked.txHash, contractsRaw: sold.booked.contractsRaw, proceedsBase: sold.booked.proceedsBase });

const c = await tap("up", ONE);

// The chain: what the vault holds now and the average-cost figures from the receipts.
const heldRaw = (await reader.readContract({ ...vault, functionName: "positionOf", args: [root.address, vaultOutcomeId(marketId, 0)] })) as bigint;
const soldRaw = sold.booked.contractsRaw;
const openCost = cost - (cost * soldRaw) / bought + c.costBase;
const realized = sold.booked.proceedsBase - (cost * soldRaw) / bought;
// The vault's own fills, read here the way the app reads them, replayed by core.
const logs = await reader.getContractEvents({ ...vault, eventName: "Executed", args: { owner: root.address, marketId }, fromBlock: (await reader.getBlockNumber()) - 5_000n });
const fills = logs.map((l) => ({ outcomeIdx: (l.args.outcomeIdx === 0 ? 0 : 1) as 0 | 1, isBuy: l.args.isBuy!, cashBase: l.args.cashDelta!, tokenRaw: l.args.tokenDelta! }));
out("replay", { fills: fills.length, ...replayVaultCost(fills) });

// The app: the Trading Balance rows the terminal and /portfolio render.
const bets = await listVaultBets(root.address);
const bet = bets.find((x) => x.marketId.toLowerCase() === marketId.toLowerCase() && x.vault.toLowerCase() === v2.eventVault.toLowerCase());
if (!bet) throw new Error("the app lists no Trading Balance bet on the Window");
const now = await provider.freshExitQuote({ marketId, decimals: 6 }, "up", bet.upRaw);
const closePays = now.ok && now.value ? now.value.proceedsBase : null;
out("app", { upRaw: bet.upRaw, costUpBase: bet.costUpBase, tallyCostBase: bet.costBase, tallyProceedsBase: bet.proceedsBase, boughtUpRaw: bet.boughtUpRaw, soldUpRaw: bet.soldUpRaw, closePaysBase: closePays, pnlBase: closePays === null ? null : closePays - bet.costUpBase, realizedBase: bet.proceedsBase - (bet.costBase - bet.costUpBase) });
const net = cost + c.costBase - sold.booked.proceedsBase;
out("chain", { heldRaw, bought: bought + c.contractsRaw, soldRaw, cost: cost + c.costBase, proceeds: sold.booked.proceedsBase, openCost, realized, oldNetCostWas: net, oldPnlWouldBe: closePays === null ? null : closePays - net });
out("match", { held: bet.upRaw === heldRaw, tally: bet.costBase === cost + c.costBase && bet.proceedsBase === sold.booked.proceedsBase, openCost: bet.costUpBase === openCost, realized: bet.proceedsBase - (bet.costBase - bet.costUpBase) === realized });
await relay.close();
process.exit(0);
