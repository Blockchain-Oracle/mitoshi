/**
 * funds-watch (plan C.5.2): pathUSD balances of every ops role key (and the web's relay fee payer when its address is
 * configured) against a floor; on Moderato a role below the floor is topped up with the node's own `tempo_fundAddress`
 * faucet (1,000,000 of each testnet stablecoin, no key of ours involved). Mainnet only reports (no faucet, L-26).
 * The balances feed `/health` and `/status` (C.6 probes).
 */
import { erc20Abi, getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TEMPO } from "@cwf/clients";
import { createOpsClient, fundAddress } from "@cwf/markets/ops";
import { errorText, roleKey, runActor, type OpsRole, type VenueDeps } from "../../runtime";

const PASS_MS = 5 * 60_000;
const ROLES: OpsRole[] = ["roller", "price-relay", "settler", "seed-maker", "keeper", "earn-quoter", "ops-fee-payer", "desk", "x-relay", "stock-sync"];
/** Below this a testnet role is topped up; on mainnet it is reported as low. */
const FLOOR_BASE = BigInt(Number(process.env.FUNDS_FLOOR_PATHUSD) > 0 ? Number(process.env.FUNDS_FLOOR_PATHUSD) : 10_000) * 1_000_000n;

export function startFundsWatch(deps: VenueDeps): { stop: () => void } {
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl });
  const watched: Array<{ name: string; address: Address }> = [];
  for (const role of ROLES) {
    const key = roleKey(role, deps.env.network, process.env, deps.env.keysDir);
    if (key) watched.push({ name: role, address: privateKeyToAccount(key).address });
  }
  const relay = process.env.RELAY_FEE_PAYER_ADDRESS;
  if (relay && /^0x[0-9a-fA-F]{40}$/.test(relay)) watched.push({ name: "relay-fee-payer", address: getAddress(relay) });
  const topUps: Array<{ role: string; txs: string[]; atSec: number }> = [];

  const pass = async () => {
    const balances = (await client.public.multicall({ contracts: watched.map((w) => ({ address: TEMPO.pathUSD as Address, abi: erc20Abi, functionName: "balanceOf" as const, args: [w.address] as const })), allowFailure: false })) as bigint[];
    const low = watched.filter((_, i) => balances[i]! < FLOOR_BASE);
    const notes: string[] = [];
    for (const w of low) {
      if (deps.env.network !== "testnet" || deps.env.dryRun) {
        notes.push(`${w.name} low${deps.env.dryRun ? " (DRY: no top-up)" : ""}`);
        continue;
      }
      try {
        const txs = await fundAddress(client.public, w.address);
        topUps.unshift({ role: w.name, txs, atSec: Math.floor(Date.now() / 1000) });
        notes.push(`topped up ${w.name}: ${txs.join(", ")}`);
      } catch (error) {
        notes.push(`top-up ${w.name} failed: ${errorText(error)}`);
      }
    }
    const shown = Object.fromEntries(watched.map((w, i) => [w.name, { address: w.address, pathUSD: balances[i]!.toString() }]));
    deps.bus.publish("session", "funds", { lowRoles: low.map((w) => w.name) });
    return {
      why: `${watched.length} wallets · ${low.length ? `low: ${low.map((w) => w.name).join(", ")}` : "all above the floor"}${notes.length ? ` | ${notes.join(" | ")}` : ""}`,
      detail: { floorBase: FLOOR_BASE.toString(), balances: shown, topUps: topUps.slice(0, 10) },
    };
  };
  return runActor({ name: "funds-watch", log: deps.log, dryRun: deps.env.dryRun, everyMs: PASS_MS, pass });
}
