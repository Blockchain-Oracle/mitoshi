/**
 * Relay policy for the `vault` area — the Trading Balance (plan C.3.3, S7; A.4.1). Shape = `engine.ts` until S1's
 * `RelayPolicy` type lands. The list is Masayume's, unchanged (D-003: our fee relay replaces the ERC-2771 forwarder;
 * the sender of every sponsored call is still the account that signed it, so sponsoring changes who pays, never who
 * acts).
 *
 * - `sponsor`: the delegated and exit calls — `placeFor` (session-key taps: the whole point of tap-trading, L-27),
 *   `withdraw` / `withdrawPrivate` (pay `msg.sender` only, P12 pre-checked), `revoke`, `crankSettle` (credits the
 *   recorded owner; the S7 settler signs it), `sweep` (moves only the vault's own engine credit).
 * - `never`: capital intake and delegation setup — `deposit`, `depositAndGrant`, `grant`, `fundGrant` (the root pays
 *   for its own money moving in and for arming a key; D-020/D-029). The `relay-policy-coverage` invariant enforces it.
 * - Not sponsored (absent from both lists, the sender pays): `place` and `moveToPrivate` (Masayume's list; Q-021 asks
 *   whether to sponsor them), `creditFor` / `creditPrivateFor` (capital intake for someone else).
 * - Geofence: `placeFor` is the markets entry (Q-008); exits stay open everywhere.
 * - Async sender (C.3.3, S7): the relay pays for `placeFor` only when the sender IS the grant's actor and the grant is
 *   live (`grantOf(id).actor == from && isGrantLive(id)`, read on chain) — a foreign or revoked key is refused before
 *   the fill, so the relay never pays to watch the vault revert `NotGrantActor`. A positive answer is remembered for
 *   15 s per (vault, grant, sender): a revoke inside that window still reverts in the fill estimate, which sends nothing.
 * - `maxGas`: measured on Moderato (acceptance/S7.md): an owner's **first** tap in a Window 3,031,167 gas (≈ 10 new
 *   slots at 250k: the vault's engine position and counters, `positionOf`, `positionGrantOf`, the tally, `marketsOf`),
 *   a later tap 1,033,108. Worst case adds 16 fills + 4 evictions (≈ 848k + 192k gross, engine-gas.md) → 4.5M.
 */
import type { Abi, Address } from "viem";
import { relayTargets } from "@cwf/clients";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import type { AsyncSenderCheck } from "../types";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** The EventVault on every chain it is deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.vault ?? []) as Address[]);

const LIVE_MEMO_MS = 15_000;
const liveMemo = new Map<string, number>();

/** `placeFor(grantId, …)` is sponsored only for the grant's own actor while the grant is live; every other call passes. */
export const vaultSender: AsyncSenderCheck = async ({ from, call, functionName, args, read }) => {
  if (functionName !== "placeFor") return true;
  if (!read || !call.to) return false;
  const grantId = args[0];
  if (typeof grantId !== "bigint" || grantId === 0n) return false;
  const memo = `${call.to.toLowerCase()}:${grantId}:${from.toLowerCase()}`;
  const at = liveMemo.get(memo);
  if (at !== undefined && Date.now() - at < LIVE_MEMO_MS) return true;
  const contract = { address: call.to, abi: eventVaultAbi as Abi };
  const [grant, live] = await Promise.all([
    read.readContract({ ...contract, functionName: "grantOf", args: [grantId] }) as Promise<{ actor: Address }>,
    read.readContract({ ...contract, functionName: "isGrantLive", args: [grantId] }) as Promise<boolean>,
  ]);
  const ok = live === true && grant.actor.toLowerCase() === from.toLowerCase();
  if (ok) liveMemo.set(memo, Date.now());
  else liveMemo.delete(memo);
  return ok;
};

export const vaultPolicy = {
  area: "vault" as const,
  targets,
  abi: eventVaultAbi as Abi,
  sponsor: ["placeFor", "withdraw", "withdrawPrivate", "revoke", "crankSettle", "sweep"] as readonly string[],
  never: ["deposit", "depositAndGrant", "grant", "fundGrant"] as readonly string[],
  pillar: "markets" as const,
  entry: ["placeFor"] as readonly string[],
  maxGas: 4_500_000n,
  asyncSender: vaultSender,
};
