import { createPublicClient, custom } from "viem";
import { verifyHash } from "viem/actions";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import type { VaultGrant } from "@cwf/core";
import { exitTriggerTypedData, type ExitTrigger } from "@cwf/core/exits";
import { tempoReadChain } from "../read-chain";
import { generateSessionKey, sessionKeyAccount } from "../sessions";
import { legacyVaultDeploymentOf, vaultDeploymentOf } from "../vault/read";
import { exitSignatureCheck, verifyExitTrigger } from "./exits";

const CHAIN = 42431;
const NOW = 1_791_489_000_000;
const v2 = vaultDeploymentOf(CHAIN)!;
const owner = privateKeyToAccount(generatePrivateKey()).address;
// The browser's session key: WebCrypto P-256, so its signature is a Tempo envelope (the case ecrecover can't read).
const record = await generateSessionKey(owner);
const key = sessionKeyAccount(record) as unknown as { address: `0x${string}`; signTypedData: (d: ReturnType<typeof exitTriggerTypedData>) => Promise<`0x${string}`> };
// Offline: `verifyHash` asks the chain only whether the signer has code (an EOA key has none).
const transport = custom({ request: async ({ method }) => { if (method === "eth_getCode") return "0x"; throw new Error(`offline: ${method}`); } });

const T: ExitTrigger = {
  owner, vault: v2.eventVault, chainId: CHAIN, market: `0x${"ab".repeat(32)}`, side: "up", grantId: 7n,
  takeProfitBase: 1_500_000n, stopLossBase: null, trailBps: 50, trailStopE8: 8_150_000_000_000n, nonce: BigInt(NOW), expiresAtSec: NOW / 1000 + 240,
};

const grant = (over: Partial<VaultGrant> = {}): VaultGrant => ({
  grantId: 7n, owner, actor: record.address, kind: "session", revoked: false, expiresAtSec: NOW / 1000 + 3_600, spentDay: 0, spentTodayBase: 0n, openPositions: 0,
  caps: { maxStakePerTradeBase: 1_000_000n, maxDailySpendBase: 10_000_000n, maxOpenPositions: 10, maxPriceRaw: 0n, market: null }, budgetBase: 10_000_000n, ...over,
});

const deps = (g: VaultGrant | null) => ({ chainId: CHAIN, nowMs: NOW, readGrant: async () => g, verify: exitSignatureCheck({ network: "testnet", transport }) });
const sign = (t: ExitTrigger) => key.signTypedData(exitTriggerTypedData(t));

describe("verifyExitTrigger", () => {
  it("accepts a trigger the owner's live P-256 session key signed on the current Trading Balance", async () => {
    expect(v2.version).toBe(2);
    expect(await verifyExitTrigger(T, await sign(T), deps(grant()))).toEqual({ ok: true, signer: record.address });
  });

  it("refuses a changed trigger, another key, another vault, and a session that can't vouch for it", async () => {
    const sig = await sign(T);
    expect(await verifyExitTrigger({ ...T, takeProfitBase: 1n }, sig, deps(grant()))).toMatchObject({ ok: false, status: 403, error: /signer/ });
    expect(await verifyExitTrigger(T, sig, deps(grant({ actor: owner })))).toMatchObject({ ok: false, status: 403, error: /signer/ });
    expect(await verifyExitTrigger(T, sig, deps(grant({ kind: "exit" })))).toMatchObject({ ok: false, status: 403, error: /session/ });
    expect(await verifyExitTrigger(T, sig, deps(grant({ revoked: true })))).toMatchObject({ ok: false, error: /turned off/ });
    expect(await verifyExitTrigger(T, sig, deps(grant({ expiresAtSec: NOW / 1000 })))).toMatchObject({ ok: false, error: /expired/ });
    expect(await verifyExitTrigger(T, sig, deps(null))).toMatchObject({ ok: false, status: 403 });
    const v1 = legacyVaultDeploymentOf(CHAIN);
    if (v1) {
      const onV1 = { ...T, vault: v1.eventVault };
      expect(await verifyExitTrigger(onV1, await sign(onV1), deps(grant()))).toMatchObject({ ok: false, status: 400, error: /current Trading Balance/ });
    }
    expect(await verifyExitTrigger(T, "0x1234", deps(grant()))).toMatchObject({ ok: false, status: 403 });
  });

  it("needs the full Tempo chain: the read runtime's plain chain can't read a P-256 envelope", async () => {
    // Why `exitSignatureCheck` builds its own client: on `tempoReadChain` the genuine key's signature fails.
    const { hashTypedData } = await import("viem");
    const hash = hashTypedData(exitTriggerTypedData(T));
    const plain = createPublicClient({ chain: tempoReadChain("testnet"), transport });
    expect(await verifyHash(plain, { address: record.address, hash, signature: await sign(T) }).catch(() => false)).toBe(false);
    expect(await exitSignatureCheck({ network: "testnet", transport })(record.address, hash, await sign(T))).toBe(true);
  });
});
