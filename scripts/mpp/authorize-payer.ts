/**
 * Authorizes the MPP payer access key on its root (plan C.5.3, S3.5) — testnet roles `mpp-root` (signs, pays the fee in
 * pathUSD) and `mpp-payer` (the key). The call comes from `@cwf/markets/server` `authorizePayerKeyCall`; `cast` sends it
 * (write-boundary). Idempotent: an already-authorized key is only read back. Prints the tx hash and the remaining
 * limits; never a key.
 *
 *   tsx scripts/mpp/authorize-payer.ts
 */
import { getAddress } from "viem";
import { authorizePayerKeyCall, defaultPayerLimits, readPayerKey } from "@cwf/markets/server";
import { tempoReadClient } from "@cwf/markets";
import { castSend, loadRole } from "../v4/lib";

const moderato = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);

const root = getAddress(loadRole("mpp-root").address);
const keyId = getAddress(loadRole("mpp-payer").address);
const limits = defaultPayerLimits("testnet");
const tokens = limits.map((l) => l.token);

let state = await readPayerKey(moderato, root, keyId, tokens);
if (!state.authorized) {
  const call = authorizePayerKeyCall({ keyId, limits });
  const r = castSend([call.to, call.data], { signer: { role: "mpp-root" } });
  console.log(`authorizeKey tx ${r.transactionHash} block ${BigInt(r.blockNumber)} status ${r.status} gas ${BigInt(r.gasUsed)}`);
  if (r.status !== "0x1") throw new Error("authorizeKey reverted");
  state = await readPayerKey(moderato, root, keyId, tokens);
}
console.log(`root ${root} key ${keyId} authorized=${state.authorized} revoked=${state.revoked} expiry=${state.expirySec}`);
for (const l of state.limits) console.log(`  ${l.token} remaining ${l.remainingBase} (period ends ${l.periodEndSec})`);
