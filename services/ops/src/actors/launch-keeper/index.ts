/**
 * The `launch-keeper` actor (plan B.5.2 / LP-07): graduates every Complete memecoin. `graduate(token)` is
 * permissionless, so the keeper only makes it prompt: each pass lists the registry's memecoins, reads their state,
 * simulates `graduate` for the Complete ones (a poisoned pool on every tier reverts `PoolPoisoned` in simulation and is
 * reported, never sent), and sends the rest one per transaction. The keeper pays its own fee (not sponsored).
 *
 * Opt-in: registered in `main.ts` but outside the default actor set; start it with `OPS_ACTORS=…,launch-keeper`.
 * Sending needs a sender (`GraduateSender`): in the ops process that is `@cwf/markets` `tx/send.ts` (S1); scripts use
 * `cast` (`scripts/drive/launch-meme.ts`). Without one it runs dry and says so.
 */
import type { Address, Hex, PublicClient } from "viem";
import { curveLaunchpadAbi } from "@cwf/clients/abis/CurveLaunchpad";
import { type Call, type MemeAddresses, LaunchState, buildGraduate, listMemecoins } from "@cwf/markets/launch";
import type { PassResult } from "../../runtime";

export const LAUNCH_KEEPER_EVERY_MS = 15_000;
/** Registry entries scanned per pass (newest first). */
export const LAUNCH_KEEPER_SCAN = 200;

export interface GraduateSender {
  account: Address;
  send(calls: Call[]): Promise<{ hash: Hex; status: "success" | "reverted" }>;
}

export interface KeeperDeps {
  list(): Promise<Address[]>;
  state(token: Address): Promise<number>;
  /** Resolves when `graduate(token)` would succeed from the keeper's account; throws with the revert otherwise. */
  simulate(token: Address): Promise<void>;
}

/** Which launches to graduate: exactly the Complete ones, in list order. */
export function planGraduations(states: readonly { token: Address; state: number }[]): Address[] {
  return states.filter((s) => s.state === LaunchState.Complete).map((s) => s.token);
}

export function keeperDeps(client: PublicClient, a: MemeAddresses, account: Address): KeeperDeps {
  return {
    list: () => listMemecoins(client, a, LAUNCH_KEEPER_SCAN),
    state: async (token) => (await client.readContract({ address: a.launchpad, abi: curveLaunchpadAbi, functionName: "getLaunch", args: [token] })).state,
    simulate: async (token) => {
      await client.simulateContract({ address: a.launchpad, abi: curveLaunchpadAbi, functionName: "graduate", args: [token], account });
    },
  };
}

export interface KeeperOutcome { token: Address; result: "graduated" | "reverted" | "refused" | "dry-run"; hash?: Hex; reason?: string }

/** One pass; `sender` absent or `dryRun` = plan and simulate only. */
export function launchKeeperPass(p: { deps: KeeperDeps; launchpad: Address; dryRun: boolean; sender?: GraduateSender }): () => Promise<PassResult & { outcomes: KeeperOutcome[] }> {
  return async () => {
    const tokens = await p.deps.list();
    const states = await Promise.all(tokens.map(async (token) => ({ token, state: await p.deps.state(token) })));
    const due = planGraduations(states);
    const outcomes: KeeperOutcome[] = [];
    for (const token of due) {
      try {
        await p.deps.simulate(token);
      } catch (e) {
        outcomes.push({ token, result: "refused", reason: e instanceof Error ? e.message.split("\n")[0] : String(e) });
        continue;
      }
      if (p.dryRun || !p.sender) {
        outcomes.push({ token, result: "dry-run" });
        continue;
      }
      const r = await p.sender.send([buildGraduate(p.launchpad, token)]);
      outcomes.push({ token, result: r.status === "success" ? "graduated" : "reverted", hash: r.hash });
    }
    const count = (k: KeeperOutcome["result"]) => outcomes.filter((o) => o.result === k).length;
    const why = due.length === 0
      ? `${tokens.length} memecoin(s), none complete`
      : `${due.length} complete: ${count("graduated")} graduated, ${count("refused")} refused, ${count("reverted")} reverted, ${count("dry-run")} dry-run${p.sender ? "" : " (no sender wired)"}`;
    return { why, detail: { scanned: tokens.length, due: due.length, outcomes }, outcomes };
  };
}
