// Ported in role from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/markets/src/ops/settle/vault-crank.ts
// (`planVaultCranks` + `vaultCrankInstruction`: every owner holding a slot on a settled Window is cranked, the settler
// paying the fee, the payout landing on the owner) — Solana account scans become the index's vault executions, confirmed
// on chain per owner before any send.
/**
 * The settler's EventVault worklist (plan C.5.2; S7; T09): the engine's `redeemFor` refuses the vault (it opted out of
 * third-party cranks, D-015), so its owners' settled Windows are paid by `EventVault.crankSettle(owner, m)` — which
 * redeems the vault's engine position and credits the owner's Trading Balance. Candidates are (Window, owner) pairs the
 * index saw trade through the vault on a Window that is now resolved or voided, with no `Settled` yet; the chain then
 * names which still hold a position or a grant tag (`ownersToCrank`), and only those are sent. No claim grace (D-155):
 * the owner has no other way to be paid, so the crank runs as soon as the Window is terminal.
 */
import type { Address, Hex } from "viem";
import { ownersToCrank, OpsSendError, sendOps, vaultCrankSettleCall, vaultVenuesOf, type OpsClient } from "@cwf/markets/ops";
import { errorText, type VenueDeps } from "../../runtime";

type Sql = NonNullable<VenueDeps["sql"]>;

/** "Someone got there first" or "not yet": look again rather than count a failure. */
const BENIGN = new Set(["NothingToSettle", "MarketNotSettled"]);
const CANDIDATE_LIMIT = 200;

export interface VaultCranker {
  counts: { cranked: number; failed: number; benign: number };
  recent: Array<{ market: string; owner: string; tx: string }>;
  /** One pass over the worklist inside the settler's send budget; its line for the heartbeat. */
  pass(budget: { sends: number }): Promise<string>;
}

export function vaultCranker(client: OpsClient, sql: Sql, dryRun: boolean): VaultCranker | null {
  // Every Trading Balance on the chain (S24.2): v1's owners keep being paid while they hold anything there.
  const venues = new Map(vaultVenuesOf(client.chainId).map((v) => [v.vault.toLowerCase(), v]));
  if (venues.size === 0) return null;
  const counts = { cranked: 0, failed: 0, benign: 0 };
  let recent: VaultCranker["recent"] = [];
  /** Pairs the chain said hold nothing (sold out before lock, or already cranked but not yet indexed). */
  const empty = new Set<string>();

  /** Owners per (vault, Window) still unpaid, keyed `<vault>|<market>`. */
  const candidates = async (): Promise<Map<string, Address[]>> => {
    const rows = await sql<{ vault: string; market: string; owner: string }[]>`
      select distinct e.vault, e.market, e.owner from idx_vault_executions e
      join idx_markets m on m.market = e.market and m.state <> 'open'
      where not exists (select 1 from idx_vault_settlements s where s.vault = e.vault and s.owner = e.owner and s.market = e.market)
      order by e.vault, e.market, e.owner limit ${CANDIDATE_LIMIT}`;
    const byMarket = new Map<string, Address[]>();
    for (const r of rows) {
      const key = `${r.vault}|${r.market}`;
      if (empty.has(`${key}:${r.owner}`) || !venues.has(r.vault)) continue;
      byMarket.set(key, [...(byMarket.get(key) ?? []), r.owner as Address]);
    }
    return byMarket;
  };

  return {
    counts,
    get recent() {
      return recent;
    },
    async pass(budget) {
      const work = await candidates();
      if (work.size === 0) return "vault: nothing to crank";
      const lines: string[] = [];
      for (const [key, owners] of work) {
        if (budget.sends <= 0) break;
        const [vaultKey, market] = key.split("|") as [string, string];
        const venue = venues.get(vaultKey)!;
        const due = await ownersToCrank(client, venue, market as Hex, owners);
        for (const o of owners) if (!due.includes(o)) empty.add(`${key}:${o}`);
        for (const owner of due) {
          if (budget.sends <= 0) break;
          const tag = `crankSettle ${market.slice(0, 10)} ${owner.slice(0, 8)}`;
          if (dryRun) {
            lines.push(`DRY ${tag}`);
            continue;
          }
          budget.sends--;
          try {
            const sent = await sendOps(client, [vaultCrankSettleCall(venue.vault, owner, market as Hex)]);
            counts.cranked++;
            recent = [{ market, owner, tx: sent.hash }, ...recent].slice(0, 20);
            lines.push(`${tag} ${sent.hash.slice(0, 10)}`);
          } catch (error) {
            const name = error instanceof OpsSendError ? error.errorName : null;
            if (name && BENIGN.has(name)) {
              counts.benign++;
              empty.add(`${key}:${owner}`);
              lines.push(`${tag} ${name}`);
            } else {
              counts.failed++;
              lines.push(`${tag} failed: ${errorText(error).slice(0, 140)}`);
            }
          }
        }
      }
      return `vault: ${lines.length ? lines.join(", ") : "candidates held nothing"}`;
    },
  };
}
