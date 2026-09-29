/** Faucet challenges and claims over Postgres (plan C.3.4). Pure policy lives in `@cwf/core/faucet`. */
import type { FaucetChallenge, FaucetClaim } from "@cwf/core/faucet";
import type { Sql } from "./index";

export interface FaucetStore {
  saveChallenge(c: FaucetChallenge): Promise<void>;
  /** Marks a live challenge used and returns it; null when missing, expired or already used (one-time). */
  takeChallenge(id: string, nowMs: number): Promise<FaucetChallenge | null>;
  lastFunded(wallet: string): Promise<FaucetClaim | null>;
  countSince(sinceMs: number, ipHash?: string): Promise<number>;
  saveClaim(c: FaucetClaim): Promise<void>;
}

type ClaimRow = { id: string; wallet: string; ip_hash: string; auth: FaucetClaim["auth"]; tx_hashes: string[]; status: FaucetClaim["status"]; created_at_ms: string };

export function createPgFaucetStore(sql: Sql): FaucetStore {
  return {
    async saveChallenge(c) {
      await sql`insert into faucet_challenges (id, wallet, ip_hash, message, created_at_ms, expires_at_ms) values (${c.id}, ${c.wallet.toLowerCase()}, ${c.ipHash}, ${c.message}, ${c.createdAtMs}, ${c.expiresAtMs})`;
    },
    async takeChallenge(id, nowMs) {
      const [r] = await sql<{ id: string; wallet: string; ip_hash: string; message: string; created_at_ms: string; expires_at_ms: string }[]>`
        update faucet_challenges set used = true where id = ${id} and not used and expires_at_ms > ${nowMs} returning *`;
      return r ? { id: r.id, wallet: r.wallet as FaucetChallenge["wallet"], ipHash: r.ip_hash, message: r.message, createdAtMs: Number(r.created_at_ms), expiresAtMs: Number(r.expires_at_ms) } : null;
    },
    async lastFunded(wallet) {
      const [r] = await sql<ClaimRow[]>`select * from faucet_claims where lower(wallet) = ${wallet.toLowerCase()} and status = 'funded' order by created_at_ms desc limit 1`;
      return r ? { id: r.id, wallet: r.wallet as FaucetClaim["wallet"], ipHash: r.ip_hash, auth: r.auth, txHashes: r.tx_hashes as FaucetClaim["txHashes"], status: r.status, createdAtMs: Number(r.created_at_ms) } : null;
    },
    async countSince(sinceMs, ipHash) {
      const [r] = await sql<{ n: string }[]>`select count(*)::text as n from faucet_claims where status = 'funded' and created_at_ms >= ${sinceMs} ${ipHash ? sql`and ip_hash = ${ipHash}` : sql``}`;
      return Number(r?.n ?? 0);
    },
    async saveClaim(c) {
      await sql`insert into faucet_claims (id, wallet, ip_hash, auth, tx_hashes, status, created_at_ms) values (${c.id}, ${c.wallet.toLowerCase()}, ${c.ipHash}, ${c.auth}, ${c.txHashes as string[]}, ${c.status}, ${c.createdAtMs})`;
    },
  };
}
