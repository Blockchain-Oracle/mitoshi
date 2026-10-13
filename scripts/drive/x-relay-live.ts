/**
 * S11 gate on Moderato (D-227): a mention executes once from the EXECUTOR grant, and a bind with a passkey signature
 * verifies. Everything on chain is real; the mention is driven — X reading works (the bot's Rettiwt session answers)
 * but no account has mentioned @Mitoshi_app yet, and this drive posts nothing on X — so the relay's own cycle
 * (`pollMentionCycle` → `executeMention`, the functions the ops actor runs) is fed the work order's text with a
 * stand-in X author id, against a real Postgres (DATABASE_URL, migrations applied here):
 *
 *   1. A passkey-shaped root (headless WebAuthn, the envelope a real passkey signs) is funded from the faucet, signs the
 *      X link text, and the server's verifier (Tempo's rules) accepts it — then refuses it for another X user.
 *   2. The root funds X trading: `depositAndGrant(EXECUTOR → the x-relay key, xGrantCaps, 30 days)`, one root tx.
 *   3. Dry run: the mention plans "would place …" and signs nothing.
 *   4. Live: a second mention places `placeFor` from the x-relay key through the root's EXECUTOR grant — filled.
 *   5. The same mention read again: not executed again (one `Executed` for the grant, one receipt).
 *
 *   DATABASE_URL=postgres://… pnpm --filter @cwf/scripts exec tsx drive/x-relay-live.ts [--stake 5] [--asset BTC] [--cadence 5m]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { GRANT_KIND_INDEX, verifySignedMessage, X_GRANT, xGrantCaps, xLinkMessage, xSignatureFresh, type XReceipt } from "@cwf/core";
import { createPgXStore, createSql, runMigrations } from "@cwf/db";
import { createSubmitterSession, FULL_TEMPO_CAPS, nowSec, tempoChain, vaultDeploymentOf } from "@cwf/markets";
import { driveClient, newPasskeyRoot } from "@cwf/markets/drive";
import { createOpsClient, pickXWindow, quoteFromBook, readBooks, xVenueOf } from "@cwf/markets/ops";
import { messageVerifier } from "@cwf/markets/server";
import { executeMention } from "../../services/ops/src/actors/x-relay/execute";
import { pollMentionCycle } from "../../services/ops/src/actors/x-relay/poll-cycle";
import { recoverMentions } from "../../services/ops/src/actors/x-relay/recovery";
import type { Mention } from "../../services/ops/src/actors/x-relay/transport";
import { fund, reader } from "./lib/actors";
import { startLocalRelay } from "./lib/relay-server";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const STAKE = arg("stake", "5");
const ASSET = arg("asset", "BTC");
const CADENCE = arg("cadence", "5m");
const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const ONE = 1_000_000n;
const out = (step: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL (a throwaway Postgres) is required");
const sql = createSql();
out("migrations", { applied: await runMigrations(sql) });
const store = createPgXStore(sql);

// The executor: the x-relay role key (funded at S0), read from its file and never printed.
const executorKey = (JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", "x-relay.json"), "utf8")) as { privateKey: Hex }).privateKey;
const ops = createOpsClient({ network: "testnet", rpcUrl: RPC, privateKey: executorKey, unitsPerSec: 0 });
const executor = ops.address!;
const xv = xVenueOf(ops.chainId)!;
const v2 = vaultDeploymentOf(42431)!;
out("venue", { executor, vault: xv.vault, engine: xv.engine });

// 1. The passkey root signs the link; the bind's verifier accepts it (and only it).
const verify = messageVerifier(createPublicClient({ chain: tempoChain("testnet"), transport: http(RPC) }) as PublicClient, { allowAccessKey: true });
const root = newPasskeyRoot();
const authorId = `9${Date.now()}`;
const issuedAtMs = Date.now();
const fields = { network: "testnet" as const, authorId, account: root.address, issuedAtMs };
const signature = await root.account.signMessage({ message: xLinkMessage(fields) });
const accepted = xSignatureFresh(issuedAtMs, Date.now()) && (await verifySignedMessage({ text: xLinkMessage(fields), signature, signer: root.address }, verify));
const otherUser = await verifySignedMessage({ text: xLinkMessage({ ...fields, authorId: "123" }), signature, signer: root.address }, verify);
out("bind", { account: root.address, standInAuthorId: authorId, signatureBytes: (signature.length - 2) / 2, accepted, acceptedForAnotherXUser: otherUser });
if (!accepted || otherUser) throw new Error("the passkey bind did not verify as it should");
await store.upsertLink({ authorId, handle: "s11_drive", account: root.address, signature, issuedAtMs });

// 2. Fund X trading: one root transaction, deposit + EXECUTOR grant to the relay's key.
await fund(root.address);
const relay = await startLocalRelay();
const owner = createSubmitterSession({ authority: "passkey", client: driveClient(root.account as never, relay.url, RPC), caps: FULL_TEMPO_CAPS, nowSec }).submitter;
const budget = 10n * ONE;
const grantTx = await owner.submitTx({ kind: "vault-deposit-and-grant", amountBase: budget, terms: { kind: "executor", actor: executor, caps: xGrantCaps(), expiresAtSec: nowSec() + X_GRANT.days * 86_400, budgetBase: budget } });
if (grantTx.status !== "confirmed") throw new Error(`grant: ${JSON.stringify(grantTx, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
const grantId = (await reader.readContract({ address: v2.eventVault, abi: eventVaultV2Abi, functionName: "activeGrantOf", args: [root.address, GRANT_KIND_INDEX.executor] })) as bigint;
out("grant", { tx: grantTx.txHash, grantId, budget, actor: executor });

// A Window to call on, with room before lock (waits up to six minutes).
let pick = await pickXWindow(ops, xv, ASSET as never, CADENCE === "5m" ? 300 : CADENCE === "15m" ? 900 : 3600, nowSec());
for (const t0 = Date.now(); (!pick.ok || pick.window.lockAtSec - nowSec() < 75) && Date.now() - t0 < 6 * 60_000; ) {
  await sleep(10_000);
  pick = await pickXWindow(ops, xv, ASSET as never, CADENCE === "5m" ? 300 : CADENCE === "15m" ? 900 : 3600, nowSec());
}
if (!pick.ok) throw new Error(`no ${ASSET} ${CADENCE} Window: ${pick.code}`);
out("window", { marketId: pick.window.marketId, lane: pick.lane, index: pick.window.index, lockInSec: pick.window.lockAtSec - nowSec() });

const text = `@Mitoshi_app ${ASSET} up ${CADENCE} $${STAKE}`;
/** The house maker re-quotes every pass; a level counts for a taker only once it has rested (TAKER_MIN_REST_SEC). */
async function waitForRestedAsk(): Promise<void> {
  if (!pick.ok) return;
  for (let i = 0; i < 12; i++) {
    const book = (await readBooks(ops, xv, [pick.window.marketId])).get(pick.window.marketId.toLowerCase()) ?? null;
    if (book && quoteFromBook(book, pick.window.grid, "up", BigInt(Math.round(Number(STAKE) * 1e6)), Date.now())) return;
    await sleep(5_000);
  }
}
const mention = (id: string): Mention => ({ id, authorId, handle: "s11_drive", text, createdAtMs: Date.now() });
const cycle = (m: Mention, dryRun: boolean) => pollMentionCycle({
  getCursor: async () => "0", setCursor: async () => undefined, fetch: async () => [m], isOwnPost: () => false,
  claim: (r) => store.claimMention(r, false), receipt: (id) => store.receiptByMention(id), save: (r) => store.saveReceipt(r),
  execute: (x) => executeMention({ client: ops, xv, store, executor, dryRun, log: (why) => out("relay", { why }) }, x),
});
const show = (r: XReceipt | null) => r && { status: r.status, refusalCode: r.refusalCode ?? null, dryRun: r.dryRun ?? false, reason: r.reason, txHash: r.txHash, stakeBase: r.stakeBase, bookedCostBase: r.bookedCostBase ?? null, bookedContractsRaw: r.bookedContractsRaw ?? null, marketId: r.marketId, lane: r.lane ?? null };

// 3. Dry run.
await waitForRestedAsk();
const dryId = `${Date.now()}1`;
out("dry-run", { text, cycle: await cycle(mention(dryId), true), receipt: show(await store.receiptByMention(dryId)) });

// 4. Live.
await waitForRestedAsk();
const fromBlock = await ops.public.getBlockNumber();
const liveId = `${Date.now()}2`;
out("live", { text, cycle: await cycle(mention(liveId), false), receipt: show(await store.receiptByMention(liveId)) });

// 5. The same mention again: claimed already, so nothing executes.
out("replay", { cycle: await cycle(mention(liveId), false) });
const executed = await ops.public.getContractEvents({ address: v2.eventVault, abi: eventVaultV2Abi, eventName: "Executed", args: { owner: root.address }, fromBlock });
const live = await store.receiptByMention(liveId);
const receipt = live?.txHash ? await reader.getTransactionReceipt({ hash: live.txHash as Hex }) : null;
out("once", {
  executedEvents: executed.map((e) => ({ tx: e.transactionHash, grantId: e.args.grantId, actor: e.args.actor, cashDelta: e.args.cashDelta, tokenDelta: e.args.tokenDelta })),
  receiptStatus: receipt?.status ?? null, block: receipt?.blockNumber ?? null,
  openAfter: await recoverMentions({ client: ops, xv, store, executor: executor as Address, log: () => undefined }),
  grantAfter: await reader.readContract({ address: v2.eventVault, abi: eventVaultV2Abi, functionName: "grantOf", args: [grantId] }),
});
await relay.close();
await sql.end();
process.exit(0);
