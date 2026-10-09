/**
 * The exit trigger store's guarantees (S24.3) on a real Postgres (`TEST_DATABASE_URL`; a fresh schema per run): a write
 * replaces only with a larger nonce and never while the keeper fires; a claim is one keeper's; the keeper's trail move
 * never overwrites a newer write.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExitTrigger } from "@cwf/core/exits";
import { createPgExitTriggersStore } from "./exit-triggers";
import { runMigrations } from "./migrations";

const url = process.env.TEST_DATABASE_URL;
const NOW = 1_791_489_000_000;
const T: ExitTrigger = {
  owner: "0xB36000000000000000000000000000000000C193",
  vault: "0x6f05b0dcaa31c241a4f6e8ceb170090b41679e95",
  chainId: 42431,
  market: `0x${"ab".repeat(32)}`,
  side: "up",
  grantId: 7n,
  takeProfitBase: 1_500_000n,
  stopLossBase: null,
  trailBps: 50,
  trailStopE8: 8_150_000_000_000n,
  nonce: BigInt(NOW),
  expiresAtSec: NOW / 1000 + 240,
};

describe.skipIf(!url)("exit triggers store", () => {
  const schema = `t_${Date.now().toString(36)}_x`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  });

  it("replaces by nonce, refuses while firing, and keeps a newer write over the keeper's trail move", async () => {
    const store = createPgExitTriggersStore(sql);
    const first = await store.write({ trigger: T, signer: "0xAAA", signature: "0x01", nowMs: NOW });
    if (!("row" in first)) throw new Error("first write refused");
    expect(first.row).toMatchObject({ status: "armed", trailStopE8: T.trailStopE8, signedTrailStopE8: T.trailStopE8, nonce: T.nonce });
    expect(await store.write({ trigger: T, signer: "0xAAA", signature: "0x01", nowMs: NOW })).toEqual({ conflict: "stale-nonce" });

    // The keeper ratchets the trail; a newer write from the owner then wins and a late ratchet on the old nonce is dropped.
    expect(await store.moveTrail(first.row.id, T.nonce, 8_160_000_000_000n, NOW + 1)).toBe(true);
    const second = await store.write({ trigger: { ...T, nonce: T.nonce + 5n, takeProfitBase: 2_000_000n }, signer: "0xAAA", signature: "0x02", nowMs: NOW + 5 });
    if (!("row" in second)) throw new Error("second write refused");
    expect(second.row.trailStopE8).toBe(T.trailStopE8);
    expect(await store.moveTrail(first.row.id, T.nonce, 8_170_000_000_000n, NOW + 6)).toBe(false);

    // One claim per nonce; a write while firing is refused; release re-arms with the reason.
    expect(await store.claim(second.row.id, T.nonce, "tp", NOW + 7)).toBe(false);
    expect(await store.claim(second.row.id, T.nonce + 5n, "tp", NOW + 7)).toBe(true);
    expect(await store.claim(second.row.id, T.nonce + 5n, "tp", NOW + 7)).toBe(false);
    expect(await store.write({ trigger: { ...T, nonce: T.nonce + 9n }, signer: "0xAAA", signature: "0x03", nowMs: NOW + 9 })).toEqual({ conflict: "firing" });
    expect((await store.firing()).map((r) => r.id)).toEqual([second.row.id]);
    await store.release(second.row.id, "no bid at or above the floor", NOW + 10);
    const [armed] = await store.armed(NOW / 1000);
    expect(armed).toMatchObject({ status: "armed", reason: null, attempts: 1, lastError: "no bid at or above the floor" });

    // Fired, then a new position on the same Window and side arms again; an empty write cancels.
    expect(await store.claim(second.row.id, T.nonce + 5n, "trail", NOW + 11)).toBe(true);
    await store.setFireTx(second.row.id, "0xfeed", NOW + 12);
    await store.markFired(second.row.id, { txHash: "0xfeed", proceedsBase: 1_620_000n, contractsRaw: 2_000_000n }, NOW + 13);
    expect(await store.armed(NOW / 1000)).toEqual([]);
    const [fired] = await store.listByOwner(T.owner);
    expect(fired).toMatchObject({ status: "fired", reason: "trail", proceedsBase: 1_620_000n, fireTx: "0xfeed" });
    const again = await store.write({ trigger: { ...T, nonce: T.nonce + 20n }, signer: "0xAAA", signature: "0x04", nowMs: NOW + 20 });
    expect("row" in again && again.row.status).toBe("armed");
    const cancel = await store.write({ trigger: { ...T, nonce: T.nonce + 21n, takeProfitBase: null, trailBps: null, trailStopE8: null }, signer: "0xAAA", signature: "0x05", nowMs: NOW + 21 });
    expect("row" in cancel && cancel.row.status).toBe("cancelled");

    // A trigger its Window outlived ends expired, with the keeper's last reason; a live one is untouched.
    const lapsing = await store.write({ trigger: { ...T, market: `0x${"77".repeat(32)}`, nonce: T.nonce + 30n }, signer: "0xAAA", signature: "0x06", nowMs: NOW + 30 });
    if (!("row" in lapsing)) throw new Error("not written");
    await store.note(lapsing.row.id, T.nonce + 30n, "no bid at or above the floor (35.6¢)", NOW + 31);
    expect(await store.expireLapsed(T.expiresAtSec - 1, NOW + 32)).toBe(0);
    expect(await store.expireLapsed(T.expiresAtSec, NOW + 33)).toBe(1);
    const ended = (await store.listByOwner(T.owner)).find((r) => r.id === lapsing.row.id);
    expect(ended).toMatchObject({ status: "expired", lastError: "the Window locked · no bid at or above the floor (35.6¢)" });
  });
});
