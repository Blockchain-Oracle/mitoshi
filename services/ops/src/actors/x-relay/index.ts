// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/index.ts and Masayume 68f7a09's — on `runActor` like
// every Mitoshi actor (S11, D-227). The relay's facts ride on its heartbeat (`/health`) and on `/x/relay`.
/**
 * x-relay (L-58, L-60): reads the bot's mentions (the account session through Rettiwt, else the X API when it has
 * credits), turns each into one receipt — idempotent by the post's id, claimed in Postgres before anything is sent —
 * and, live, places it for the linked account through that account's EXECUTOR grant with the executor key. Dry by
 * default: it signs only with `X_RELAY_LIVE=1` (and ops' `DRY_RUN=0`). A receipt reply posts as the bot only live and
 * with `X_POSTING_ENABLED=1`. When X refuses every way in, the heartbeat says which refusal and why, and it waits.
 */
import type { Address } from "viem";
import { TEMPO_RPC_HTTP, type XReadState, type XRelayStatus } from "@cwf/core";
import { createPgXDelivery, createPgXStore } from "@cwf/db";
import { createOpsClient, xVenueOf } from "@cwf/markets/ops";
import { errorText, runActor, type VenueDeps } from "../../runtime";
import { readRelayEnv, RELAY_ENV } from "./env";
import { executeMention } from "./execute";
import { pollMentionCycle } from "./poll-cycle";
import { recoverMentions } from "./recovery";
import { chooseReader, type Reader } from "./reading";
import { deliverReplies } from "./reply";
import { XRateLimitedError, XReadBlockedError } from "./transport";

const CURSOR_KEY = "mentions.since_id";
/** A blocked way in is tried again this often (credits bought, a session renewed, the rate window over). */
const REPROBE_MS = 5 * 60_000;
const BLOCKED_PASS_MS = 60_000;

const siteOf = (network: string) => (process.env.APP_ORIGIN?.trim() || (network === "mainnet" ? "https://mitoshi.xyz" : "https://testnet.mitoshi.xyz")).replace(/\/+$/, "");

export function startXRelay(deps: Pick<VenueDeps, "env" | "log" | "sql" | "bus">): { stop: () => void } {
  const env = readRelayEnv(deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl || TEMPO_RPC_HTTP[deps.env.network], privateKey: env.executorKey, tier: 1 });
  const xv = xVenueOf(client.chainId);
  const executor = client.address as Address | null;
  const dryRun = deps.env.dryRun || !env.live || !executor;
  const store = deps.sql ? createPgXStore(deps.sql) : null;
  const delivery = deps.sql ? createPgXDelivery(deps.sql) : null;
  const site = siteOf(deps.env.network);
  let reader: Reader | null = null;
  let handled = 0;
  const status = (reading: XReadState, posting: boolean): XRelayStatus => ({ running: true, dryRun, executor, handle: env.handle, reading, posting, handled });

  if (!env.live) deps.log(`dry run: set ${RELAY_ENV.live}=1 (with DRY_RUN=0) to sign`);
  if (env.missing.length) deps.log(`not configured — ${env.missing.join(", ")}`);

  const pass = async () => {
    const unread: XReadState = reader?.state ?? { via: "none", ok: false, block: "unconfigured", detail: env.missing.join(", ") || null, checkedAtMs: null };
    if (!store || !delivery) return { why: "no DATABASE_URL: receipts and the mention cursor need Postgres; holding", detail: { status: status(unread, false) } };
    if (!xv) return { why: "the Trading Balance (EventVaultV2) is not deployed on this network; idle", detail: { status: status(unread, false) } };
    const now = Date.now();
    if (!reader || (!reader.transport && now - (reader.state.checkedAtMs ?? 0) > REPROBE_MS)) {
      reader = await chooseReader(env);
      deps.log(reader.transport ? `reading mentions via ${reader.transport.describe()}` : `mentions unreadable (${reader.state.block}): ${reader.state.detail ?? ""}`);
    }
    const transport = reader.transport;
    const posting = !dryRun && env.postingEnabled && Boolean(transport?.reply);
    if (!transport) return { why: `mentions unreadable — ${reader.state.block}: ${reader.state.detail ?? "no way in"}; retrying every ${REPROBE_MS / 60_000} min`, detail: { status: status(reader.state, false) }, nextDelayMs: BLOCKED_PASS_MS };

    if (!dryRun && executor) {
      const open = await recoverMentions({ client, xv, store, executor, log: deps.log });
      if (open > 0) return { why: `${open} mention(s) with unknown confirmation; holding new ones until each is settled from the chain`, detail: { status: status(reader.state, posting) } };
    }
    if (Date.now() < (transport.readyAtMs?.() ?? 0)) return { why: `X's read budget resets at ${new Date(transport.readyAtMs!()).toISOString()}; waiting`, detail: { status: status(reader.state, posting) } };

    let result: { processed: number; held: boolean };
    try {
      result = await pollMentionCycle({
        getCursor: () => store.stateGet(CURSOR_KEY),
        setCursor: (id) => store.stateSet(CURSOR_KEY, id),
        fetch: (since) => transport.fetchMentions(since),
        isOwnPost: (m) => m.authorId === reader?.botId,
        claim: (r) => store.claimMention(r, posting),
        receipt: (id) => store.receiptByMention(id),
        execute: (m) => executeMention({ client, xv, store, executor, dryRun, log: deps.log }, m),
        save: async (r) => {
          await store.saveReceipt(r);
          handled += 1;
          if (r.wallet) deps.bus.publish(`user:${r.wallet.toLowerCase()}`, "x-receipt", { mentionId: r.mentionId, status: r.status, txHash: r.txHash });
        },
      });
    } catch (error) {
      if (error instanceof XReadBlockedError || error instanceof XRateLimitedError) {
        // The way in stopped working mid-run: look again on the next pass (or after the rate window).
        reader = { transport: error instanceof XRateLimitedError ? transport : null, botId: reader.botId, state: { ...reader.state, ok: false, block: error instanceof XReadBlockedError ? error.block : "rate-limited", detail: error.message, checkedAtMs: Date.now() } };
      }
      throw error;
    }
    reader.state = { ...reader.state, ok: true, block: null, checkedAtMs: Date.now() };
    const replies = posting ? await deliverReplies({ store, delivery, transport, network: deps.env.network, site, log: deps.log }).catch((e) => (deps.log(`replies: ${errorText(e)}`), 0)) : 0;
    const why = `${transport.describe()}: ${result.processed} new mention(s)${result.held ? " (held)" : ""}${replies ? `, ${replies} repl${replies === 1 ? "y" : "ies"}` : ""}${dryRun ? " · DRY RUN" : ""}`;
    return { why, detail: { status: status(reader.state, posting) } };
  };

  deps.log(`x-relay executor ${executor ?? "(none)"}${xv ? ` on vault ${xv.vault}` : ""}; posting ${env.postingEnabled ? "asked" : "off"}`);
  return runActor({ name: "x-relay", log: deps.log, dryRun, everyMs: env.pollMs, pass, critical: false });
}
