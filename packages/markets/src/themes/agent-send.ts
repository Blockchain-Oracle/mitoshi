/**
 * The theme agent's send (S16a; R4-11, D-227): the follower's theme key signs `[approve × k, rebalance]` as the
 * follower's access key (viem/tempo `Account.fromSecp256k1(key, { access: follower })`, a keychain v2 signature), self-
 * paid through `sendBatch` with an expiring nonce. Here, in the markets package, because only it does chain I/O; ops'
 * theme-agent hands it the unsealed key and the calls and never builds a signer of its own.
 */
import { createWalletClient, http, type Address, type Chain, type Hex } from "viem";
import { Account as TempoAccount } from "viem/tempo";
import { sendBatch } from "../tx/send";

export async function sendThemeRebalance(p: { chain: Chain; rpcUrl: string; keyPrivateKey: Hex; follower: Address; calls: { to: Address; data: Hex }[]; nowSec: number }): Promise<{ hash: Hex; status: "success" | "reverted" }> {
  const account = TempoAccount.fromSecp256k1(p.keyPrivateKey, { access: p.follower });
  const wallet = createWalletClient({ account, chain: p.chain, transport: http(p.rpcUrl) });
  const sent = await sendBatch(wallet as never, { calls: p.calls, sponsored: false, nonce: { kind: "expiring", validForSec: 25 }, nowSec: p.nowSec } as never);
  return { hash: sent.hash, status: sent.receipt.status };
}
