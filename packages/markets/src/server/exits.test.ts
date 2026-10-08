import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { describe, expect, it } from "vitest";
import type { VaultGrant } from "@cwf/core";
import { exitTriggerTypedData, type ExitTrigger } from "@cwf/core/exits";
import { vaultDeploymentOf, legacyVaultDeploymentOf } from "../vault/read";
import { verifyExitTrigger } from "./exits";

const CHAIN = 42431;
const NOW = 1_791_489_000_000;
const v2 = vaultDeploymentOf(CHAIN)!;
const key = privateKeyToAccount(generatePrivateKey());
const owner = privateKeyToAccount(generatePrivateKey()).address;

const T: ExitTrigger = {
  owner, vault: v2.eventVault, chainId: CHAIN, market: `0x${"ab".repeat(32)}`, side: "up", grantId: 7n,
  takeProfitBase: 1_500_000n, stopLossBase: null, trailBps: 50, trailStopE8: 8_150_000_000_000n, nonce: BigInt(NOW), expiresAtSec: NOW / 1000 + 240,
};

const grant = (over: Partial<VaultGrant> = {}): VaultGrant => ({
  grantId: 7n, owner, actor: key.address, kind: "session", revoked: false, expiresAtSec: NOW / 1000 + 3_600, spentDay: 0, spentTodayBase: 0n, openPositions: 0,
  caps: { maxStakePerTradeBase: 1_000_000n, maxDailySpendBase: 10_000_000n, maxOpenPositions: 10, maxPriceRaw: 0n, market: null }, budgetBase: 10_000_000n, ...over,
});

const deps = (g: VaultGrant | null) => ({ chainId: CHAIN, nowMs: NOW, readGrant: async () => g });
const sign = (t: ExitTrigger) => key.signTypedData(exitTriggerTypedData(t));

describe("verifyExitTrigger", () => {
  it("accepts a trigger the owner's live session key signed on the current Trading Balance", async () => {
    expect(v2.version).toBe(2);
    expect(await verifyExitTrigger(T, await sign(T), deps(grant()))).toEqual({ ok: true, signer: key.address });
  });

  it("refuses a changed trigger, another key, another vault, and a session that can't vouch for it", async () => {
    const sig = await sign(T);
    expect(await verifyExitTrigger({ ...T, takeProfitBase: 1n }, sig, deps(grant()))).toMatchObject({ ok: false, status: 403, error: /signer/ });
    expect(await verifyExitTrigger(T, sig, deps(grant({ actor: owner })))).toMatchObject({ ok: false, status: 403 });
    expect(await verifyExitTrigger(T, sig, deps(grant({ kind: "exit" })))).toMatchObject({ ok: false, status: 403, error: /session/ });
    expect(await verifyExitTrigger(T, sig, deps(grant({ revoked: true })))).toMatchObject({ ok: false, error: /turned off/ });
    expect(await verifyExitTrigger(T, sig, deps(grant({ expiresAtSec: NOW / 1000 })))).toMatchObject({ ok: false, error: /expired/ });
    expect(await verifyExitTrigger(T, sig, deps(null))).toMatchObject({ ok: false, status: 403 });
    const v1 = legacyVaultDeploymentOf(CHAIN);
    if (v1) {
      const onV1 = { ...T, vault: v1.eventVault };
      expect(await verifyExitTrigger(onV1, await sign(onV1), deps(grant()))).toMatchObject({ ok: false, status: 400, error: /current Trading Balance/ });
    }
    expect(await verifyExitTrigger(T, "0x1234", deps(grant()))).toMatchObject({ ok: false, status: 400 });
  });
});
