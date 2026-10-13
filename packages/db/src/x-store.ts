// Ported from Owarine 90a91d71:packages/db/src/x.ts (links, receipts, relay state) and Masayume 68f7a09's x stores — a
// store over the caller's `sql` (Mitoshi's style), with Owarine's seat party mapped to the Mitoshi account (the Tempo
// address that signed the link; `x_links.wallet`), plus the server-side OAuth state (migrations/x/0002, S11, D-227).
import type { XReceipt, XReceiptDetails, XReceiptStatus } from "@cwf/core";
import type { Sql } from "./index";

export interface XLinkRecord {
  authorId: string;
  handle: string | null;
  /** The Mitoshi account, lowercased. */
  account: string;
  signature: string;
  issuedAtMs: number;
  createdAtMs: number;
}

type LinkRow = { author_id: string; handle: string | null; wallet: string; signature: string; issued_at_ms: string; created_at: Date };
const toLink = (r: LinkRow): XLinkRecord => ({ authorId: r.author_id, handle: r.handle, account: r.wallet, signature: r.signature, issuedAtMs: Number(r.issued_at_ms), createdAtMs: r.created_at.getTime() });

type ReceiptRow = {
  mention_id: string; author_id: string; handle: string | null; wallet: string | null; grant_id: string | null; market_id: string | null; side: "up" | "down" | null;
  stake_base: string | null; details: unknown; status: XReceiptStatus; reason: string | null; tx_hash: string | null; instruction: string; at_ms: string;
};

const BASE = /^(0|[1-9]\d{0,77})$/;
const str = (v: unknown, max = 256) => (typeof v === "string" && v.length <= max ? v : undefined);
const int = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined);

/** The details a row may carry, each checked; anything else in the JSON is dropped (an old or odd row still reads). */
export function readReceiptDetails(value: unknown): XReceiptDetails {
  const d = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {
    bookedCostBase: typeof d.bookedCostBase === "string" && BASE.test(d.bookedCostBase) ? d.bookedCostBase : undefined,
    bookedContractsRaw: typeof d.bookedContractsRaw === "string" && BASE.test(d.bookedContractsRaw) ? d.bookedContractsRaw : undefined,
    avgPriceBps: int(d.avgPriceBps), asset: str(d.asset, 16), intervalSec: int(d.intervalSec), expirySec: int(d.expirySec),
    refusalCode: str(d.refusalCode, 40), parseRefusal: str(d.parseRefusal, 40), entryClosesAtSec: int(d.entryClosesAtSec), nextWindowAtSec: int(d.nextWindowAtSec),
    executionActor: typeof d.executionActor === "string" && /^0x[0-9a-f]{40}$/.test(d.executionActor) ? d.executionActor : undefined,
    poolAddress: str(d.poolAddress, 80), collateralDecimals: int(d.collateralDecimals), intentRecordedAtMs: int(d.intentRecordedAtMs),
    journalState: str(d.journalState, 16), recoveryFromBlock: typeof d.recoveryFromBlock === "string" && BASE.test(d.recoveryFromBlock) ? d.recoveryFromBlock : undefined,
    expectedNonce: int(d.expectedNonce), lane: str(d.lane, 16), dryRun: typeof d.dryRun === "boolean" ? d.dryRun : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as XReceiptDetails;
}

const DETAIL_KEYS = ["bookedCostBase", "bookedContractsRaw", "avgPriceBps", "asset", "intervalSec", "expirySec", "refusalCode", "parseRefusal", "entryClosesAtSec", "nextWindowAtSec", "executionActor", "poolAddress", "collateralDecimals", "intentRecordedAtMs", "journalState", "recoveryFromBlock", "expectedNonce", "lane", "dryRun"] as const;
const detailsOf = (r: Partial<XReceiptDetails>): Record<string, unknown> => ({ ...readReceiptDetails(Object.fromEntries(DETAIL_KEYS.map((k) => [k, r[k] ?? undefined]))) });

const toReceipt = (r: ReceiptRow): XReceipt => ({
  ...readReceiptDetails(r.details), mentionId: r.mention_id, authorId: r.author_id, handle: r.handle, wallet: r.wallet, grantId: r.grant_id, marketId: r.market_id,
  side: r.side, stakeBase: r.stake_base, status: r.status, reason: r.reason, txHash: r.tx_hash, instruction: r.instruction, atMs: Number(r.at_ms),
});

const RECEIPT_COLUMNS = "mention_id, author_id, handle, wallet, grant_id, market_id, side, stake_base, details, status, reason, tx_hash, instruction, at_ms";

/** A pending sign-in: OAuth's state and PKCE verifier, bound to the browser (and caller) that started it. */
export interface XAuthorizeRow {
  bindingHash: string | null;
  caller: string | null;
  pkceVerifier: string;
  appChallenge: string | null;
  returnPath: string | null;
}

export function createPgXStore(sql: Sql) {
  return {
    // --- links: one live route per X account and one per account ---------------------------------------------------
    async linkByAuthor(authorId: string): Promise<XLinkRecord | null> {
      const [r] = await sql<LinkRow[]>`select author_id, handle, wallet, signature, issued_at_ms, created_at from x_links where author_id = ${authorId} and revoked_at is null order by created_at desc limit 1`;
      return r ? toLink(r) : null;
    },
    async linkByAccount(account: string): Promise<XLinkRecord | null> {
      const [r] = await sql<LinkRow[]>`select author_id, handle, wallet, signature, issued_at_ms, created_at from x_links where wallet = ${account.toLowerCase()} and revoked_at is null order by created_at desc limit 1`;
      return r ? toLink(r) : null;
    },
    /** Points an X account at an account: an account re-pointed to a new X account drops its old route (Owarine). */
    async upsertLink(link: Omit<XLinkRecord, "createdAtMs">): Promise<XLinkRecord> {
      const account = link.account.toLowerCase();
      const [r] = await sql.begin(async (tx) => {
        await tx`update x_links set revoked_at = now() where revoked_at is null and (wallet = ${account} or author_id = ${link.authorId})`;
        return tx<LinkRow[]>`insert into x_links (author_id, handle, wallet, signature, issued_at_ms) values (${link.authorId}, ${link.handle}, ${account}, ${link.signature}, ${link.issuedAtMs})
          returning author_id, handle, wallet, signature, issued_at_ms, created_at`;
      });
      return toLink(r!);
    },
    async revokeLink(authorId: string, account: string): Promise<boolean> {
      const rows = await sql`update x_links set revoked_at = now() where author_id = ${authorId} and wallet = ${account.toLowerCase()} and revoked_at is null returning id`;
      return rows.length > 0;
    },

    // --- receipts: one row per mention, claimed before anything is sent -----------------------------------------------
    async receiptByMention(mentionId: string): Promise<XReceipt | null> {
      const [r] = await sql<ReceiptRow[]>`select ${sql.unsafe(RECEIPT_COLUMNS)} from x_receipts where mention_id = ${mentionId}`;
      return r ? toReceipt(r) : null;
    },
    /** The mention's claim: true for the one caller that inserted it — every other sees false and must not execute. */
    async claimMention(r: XReceipt, queueReply: boolean): Promise<boolean> {
      return sql.begin(async (tx) => {
        const rows = await tx`insert into x_receipts (mention_id, author_id, handle, wallet, grant_id, market_id, side, stake_base, details, status, reason, tx_hash, instruction, at_ms)
          values (${r.mentionId}, ${r.authorId}, ${r.handle}, ${r.wallet}, ${r.grantId}, ${r.marketId}, ${r.side}, ${r.stakeBase}, ${tx.json(detailsOf(r) as never)}, ${r.status}, ${r.reason}, ${r.txHash}, ${r.instruction}, ${r.atMs})
          on conflict (mention_id) do nothing returning mention_id`;
        if (rows.length === 1 && queueReply) await tx`insert into x_reply_delivery (mention_id) values (${r.mentionId}) on conflict do nothing`;
        return rows.length === 1;
      });
    },
    /** The receipt's latest word: a final status is never downgraded, and a stored hash is never replaced by another. */
    async saveReceipt(r: XReceipt): Promise<void> {
      await sql`update x_receipts set wallet = ${r.wallet}, grant_id = ${r.grantId}, market_id = ${r.marketId}, side = ${r.side}, stake_base = ${r.stakeBase},
          details = coalesce(details, '{}'::jsonb) || ${sql.json(detailsOf(r) as never)}, status = ${r.status}, reason = ${r.reason}, tx_hash = coalesce(${r.txHash}, tx_hash), updated_at = now()
        where mention_id = ${r.mentionId}
          and not (status in ('filled', 'nothing-filled', 'reverted', 'refused') and ${r.status} in ('submitted', 'unknown'))
          and (tx_hash is null or ${r.txHash}::text is null or tx_hash = ${r.txHash})`;
    },
    /** The hash, once signed and before the send: a restart settles the mention from its receipt, never resends it. */
    async recordTx(mentionId: string, txHash: string): Promise<void> {
      await sql`update x_receipts set tx_hash = ${txHash.toLowerCase()}, details = coalesce(details, '{}'::jsonb) || '{"journalState":"sent"}'::jsonb, updated_at = now()
        where mention_id = ${mentionId} and tx_hash is null and status in ('submitted', 'unknown')`;
    },
    /** Mentions this executor left open (a crash, a lost send): settled by recovery from the stored hash. */
    async unresolved(actor: string): Promise<XReceipt[]> {
      const rows = await sql<ReceiptRow[]>`select ${sql.unsafe(RECEIPT_COLUMNS)} from x_receipts
        where status in ('submitted', 'unknown') and details->>'executionActor' = ${actor.toLowerCase()} order by updated_at limit 20`;
      return rows.map(toReceipt);
    },
    async receiptsByAccount(account: string, limit: number): Promise<XReceipt[]> {
      const rows = await sql<ReceiptRow[]>`select ${sql.unsafe(RECEIPT_COLUMNS)} from x_receipts where wallet = ${account.toLowerCase()} order by at_ms desc limit ${limit}`;
      return rows.map(toReceipt);
    },

    // --- the relay's durable scalars (the mention cursor) -------------------------------------------------------------
    async stateGet(key: string): Promise<string | null> {
      const [r] = await sql<{ value: string }[]>`select value from x_relay_state where key = ${key}`;
      return r?.value ?? null;
    },
    async stateSet(key: string, value: string): Promise<void> {
      await sql`insert into x_relay_state (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
    },

    // --- server-side OAuth state (S11) --------------------------------------------------------------------------------
    async putAuthorize(stateHash: string, row: XAuthorizeRow, ttlSec: number): Promise<void> {
      await sql`delete from x_oauth_states where expires_at < now()`;
      await sql`insert into x_oauth_states (id_hash, kind, binding_hash, caller, pkce_verifier, app_challenge, return_path, expires_at)
        values (${stateHash}, 'authorize', ${row.bindingHash}, ${row.caller}, ${row.pkceVerifier}, ${row.appChallenge}, ${row.returnPath}, now() + make_interval(secs => ${ttlSec}))`;
    },
    /** Taken once: the row is deleted as it is read, and only while it is fresh. */
    async takeAuthorize(stateHash: string): Promise<XAuthorizeRow | null> {
      const [r] = await sql<{ binding_hash: string | null; caller: string | null; pkce_verifier: string; app_challenge: string | null; return_path: string | null; fresh: boolean }[]>`
        delete from x_oauth_states where id_hash = ${stateHash} and kind = 'authorize' returning binding_hash, caller, pkce_verifier, app_challenge, return_path, expires_at > now() as fresh`;
      return r && r.fresh ? { bindingHash: r.binding_hash, caller: r.caller, pkceVerifier: r.pkce_verifier, appChallenge: r.app_challenge, returnPath: r.return_path } : null;
    },
    async putNative(codeHash: string, appChallenge: string, session: string, ttlSec: number): Promise<void> {
      await sql`insert into x_oauth_states (id_hash, kind, app_challenge, session, expires_at) values (${codeHash}, 'native', ${appChallenge}, ${session}, now() + make_interval(secs => ${ttlSec}))`;
    },
    /** The app's one exchange: the code is burnt whatever the verifier, so a caught code can't be tried twice. */
    async takeNative(codeHash: string): Promise<{ appChallenge: string; session: string } | null> {
      const [r] = await sql<{ app_challenge: string; session: string; fresh: boolean }[]>`
        delete from x_oauth_states where id_hash = ${codeHash} and kind = 'native' returning app_challenge, session, expires_at > now() as fresh`;
      return r && r.fresh ? { appChallenge: r.app_challenge, session: r.session } : null;
    },
  };
}

export type XStore = ReturnType<typeof createPgXStore>;
