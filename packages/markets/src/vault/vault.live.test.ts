/**
 * The vault's off-chain reads against Moderato itself (the S7.5 live drive's owner, grant and tap; acceptance/S7.md):
 * the snapshot and holdings read the deployed EventVault, a real `placeFor` receipt books from its `Executed` event,
 * and killed-tab evidence finds the real tap by its actor — and finds nothing for a key that never tapped.
 * `pnpm --filter @cwf/markets test:live`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { toMarketId, type IntentRecord } from "@cwf/core";
import { parseMarketsEnv } from "../env";
import { configureMarkets, getPublicClient } from "../runtime/read-runtime";
import { bookVaultFill } from "./order";
import { readVaultGrant, readVaultHoldings, readVaultSnapshot, vaultDeploymentOf } from "./read";
import { vaultEvidence } from "./recovery";

const OWNER = "0x118d23EE8f38666bE9987e95F023B4B444651ff0" as Address;
const KEY = "0x8Ae1C05a4038bad04d17B763A15BfD791F524D0a" as Address;
const M = toMarketId("0x42bd67a68cdb00c58657eb826592605acc9787a014ce132c85e08e8c1b7ea56c");
const UP_TAP = "0x3866f7c47b0622cec515d48732f188e50fa8e21d5b12b551db3961f338ccc499" as Hex;

beforeAll(() => configureMarkets({ ...parseMarketsEnv(), network: "testnet" }));

describe("EventVault reads on Moderato", () => {
  it("reads the owner's balance and no live session grant (grant #1 was revoked)", async () => {
    const snap = await readVaultSnapshot(OWNER);
    expect(snap?.deployment.eventVault.toLowerCase()).toBe("0x5e38dc8b7402ffb608134872a64663e5d75235b8");
    expect(snap!.account.totalDepositedBase).toBe(10_000_000n);
    expect(snap!.account.availableBase).toBe(4_980_000n);
    expect(snap!.grants.session).toBeNull();
    const g = await readVaultGrant(1n);
    expect(g).toMatchObject({ owner: OWNER.toLowerCase(), actor: KEY.toLowerCase(), kind: "session", revoked: true, caps: { maxPriceRaw: 950_000n, market: M } });
  });

  it("holds nothing on the settled, cranked Window", async () => {
    expect(await readVaultHoldings(OWNER, M)).toMatchObject({ upRaw: 0n, downRaw: 0n, upGrantId: 0n, downGrantId: 0n });
  });

  it("books a real session tap from the vault's own Executed event", async () => {
    const client = await getPublicClient();
    const receipt = await client.getTransactionReceipt({ hash: UP_TAP });
    const booked = bookVaultFill(receipt.logs as never, vaultDeploymentOf(42431)!.eventVault, OWNER, M, 1n, "up", UP_TAP);
    expect(booked).toMatchObject({ marketId: M, side: "up", txHash: UP_TAP, fillCount: 1 });
    expect(booked!.contractsRaw > 0n && booked!.costBase > 0n).toBe(true);
    expect(bookVaultFill(receipt.logs as never, vaultDeploymentOf(42431)!.eventVault, OWNER, M, 2n, "up", UP_TAP)).toBeNull();
  });

  it("killed-tab evidence: the tap's actor landed on that Window; a key that never tapped is absent", async () => {
    const client = await getPublicClient();
    const block = await client.getBlock({ blockNumber: (await client.getTransactionReceipt({ hash: UP_TAP })).blockNumber });
    const sinceSec = Number(block.timestamp) - 5;
    const record = { id: "r1", kind: "order", wallet: KEY, createdAtMs: sinceSec * 1000, state: "unknown", summary: "Up", chainId: 42431, validBeforeSec: sinceSec + 25, nonceKind: "expiring", sponsored: true, marketId: M } as IntentRecord;
    expect(await vaultEvidence(KEY, record, sinceSec)).toBe("landed");
    // The same key's tap on the same Window, but outside this record's own life (written 2 min later): absent.
    const later = { ...record, createdAtMs: (sinceSec + 120) * 1000, validBeforeSec: sinceSec + 145 };
    expect(await vaultEvidence(KEY, later, sinceSec + 120)).toBe("absent");
    expect(await vaultEvidence("0x00000000000000000000000000000000000000b2", { ...record, wallet: "0x00000000000000000000000000000000000000b2" }, sinceSec)).toBe("absent");
  });
});
