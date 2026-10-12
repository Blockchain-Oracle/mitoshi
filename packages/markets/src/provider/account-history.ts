/**
 * One account history (D-227): the wallet's own rounds (`listWalletHistory`), the Trading Balance's Windows (the vault's
 * tallies, every vault) and the Boosts no longer live (the reserve's), merged by core (`vaultRound`, `boostRound`,
 * `mergeRounds`) into the `WalletHistory` shape, so the PnL card, the history, the record curve and Trader Edge read one
 * figure that counts one-tap and Boost trades too. A source that fails to read leaves the history marked incomplete
 * rather than silently smaller; the wallet's own rounds are required.
 */
import { boostRound, mergeRounds, vaultRound, type Address, type Reading, type SettledRound, type WalletHistory } from "@cwf/core";
import { readWindows } from "../engine/lens";
import { listLeveragePositionsOf } from "../leverage/read";
import { nowSec } from "../runtime/clock";
import { withReading } from "../runtime/reading";
import { listVaultBets } from "../vault/positions";
import { listWalletHistory } from "./wallet-reads";

/** Trading Balance Windows read back for the history (the terminal's own list keeps the latest 24). */
const VAULT_HISTORY_WINDOWS = 120;

export const listAccountHistory = (wallet: Address): Promise<Reading<WalletHistory>> =>
  withReading(`accountHistory:${wallet.toLowerCase()}`, async (inner) => {
    const [own, bets, boosts] = await Promise.all([listWalletHistory(wallet), listVaultBets(wallet, VAULT_HISTORY_WINDOWS).catch(() => null), listLeveragePositionsOf(wallet)]);
    const history = inner(own);
    const now = nowSec();
    const vault = bets ? bets.flatMap((b) => vaultRound(b, now) ?? []) : null;
    const done = boosts.ok ? boosts.value.filter((p) => p.status !== "live") : null;
    let boost: SettledRound[] | null = null;
    if (done) {
      const windows = await readWindows([...new Set(done.map((p) => p.marketId))]).catch(() => null);
      boost = windows
        ? done.flatMap((p) => {
            const w = windows.get(p.marketId);
            return w ? (boostRound(p, { asset: w.market.asset, intervalSec: w.market.intervalSec, decimals: w.market.decimals, voided: w.market.state === "voided", winningOutcome: w.market.winningOutcome, resolvedAtMs: w.market.resolvedAtMs }) ?? []) : [];
          })
        : null;
    }
    return {
      ...history,
      rounds: mergeRounds(history.rounds, vault ?? [], boost ?? []),
      complete: history.complete && vault !== null && boost !== null && (bets?.length ?? 0) < VAULT_HISTORY_WINDOWS,
    };
  });
