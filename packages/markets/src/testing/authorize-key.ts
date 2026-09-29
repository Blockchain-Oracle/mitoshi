/**
 * E2E support (not bundled by the app): authorise a real, limited P-256 access key on an account whose root key the
 * test holds — e.g. the credential of a Chrome virtual authenticator, rebuilt headlessly so the same passkey account
 * signs. Lives here because only `@cwf/markets` may import `viem/tempo` and send (chain-io and write boundaries). The
 * root pays its own fee: authorising keys is never sponsored (relay `keys` policy).
 */
import { P256 } from "ox";
import { createWalletClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import { Abis, Account } from "viem/tempo";
import { TEMPO } from "@cwf/clients";
import { PATH_USD, tempoChain } from "../chains";
import { sendBatch } from "../tx/send";

export interface AuthorizedTestKey {
  account: Address;
  keyId: Address;
  txHash: Hex;
}

export async function authorizeTestKey(input: { rpcUrl: string; rootP256PrivateKey: Hex; webAuthn?: { rpId: string; origin: string }; limitBase: bigint; periodSec: bigint; validForSec: number }): Promise<AuthorizedTestKey> {
  const root = input.webAuthn ? Account.fromHeadlessWebAuthn(input.rootP256PrivateKey, input.webAuthn) : Account.fromP256(input.rootP256PrivateKey);
  const chain = tempoChain("testnet");
  const wallet = createWalletClient({ account: root, chain, transport: http(input.rpcUrl) });
  const keyId = Account.fromP256(P256.randomPrivateKey()).address as Address;
  const nowSec = Math.floor(Date.now() / 1_000);
  // KeyRestrictions; "expiry" (unix seconds) is the precompile's own field name.
  const config = { "expiry": BigInt(nowSec + input.validForSec), enforceLimits: true, limits: [{ token: PATH_USD, amount: input.limitBase, period: input.periodSec }], allowAnyCalls: true, allowedCalls: [] };
  const data = encodeFunctionData({ abi: Abis.accountKeychain, functionName: "authorizeKey", args: [keyId, 1, config] });
  const sent = await sendBatch(wallet as never, { calls: [{ to: TEMPO.accountKeychain as Address, data }], sponsored: false, nonce: { kind: "expiring" }, nowSec });
  if (sent.receipt.status !== "success") throw new Error(`authorizeKey reverted: ${sent.hash}`);
  return { account: root.address as Address, keyId, txHash: sent.hash };
}
