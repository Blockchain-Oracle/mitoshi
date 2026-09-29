import { describe, expect, it } from "vitest";
import type { Address, IntentRecord } from "@cwf/core";
import { createMemoryJournal } from "./journal-memory";
import { EXPIRY_GRACE_SEC, reconcileRecord } from "./reconcile";
import { recoverUnresolved } from "./recovery";

const WALLET = "0x00000000000000000000000000000000000000a1" as Address;
const entry = { kind: "noop" as const, wallet: WALLET, summary: "x", chainId: 42431, validBeforeSec: 1_025, nonceKind: "expiring" as const, sponsored: true };
const noReceipt = { getTransactionReceipt: async () => { throw new Error("not found"); } };

describe("journal + reconcile (L-08)", () => {
  it("records the expiring window and lists only unresolved records of the wallet", async () => {
    const journal = createMemoryJournal(() => 1_000_000);
    const a = await journal.record(entry);
    const b = await journal.record(entry);
    await journal.markConfirmed(b.id);
    expect(a).toMatchObject({ state: "recorded", validBeforeSec: 1_025, nonceKind: "expiring", sponsored: true, chainId: 42431 });
    expect((await journal.listUnresolved(WALLET)).map((r) => r.id)).toEqual([a.id]);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("decides by receipt when a hash exists, and never claims absence before the window closes", async () => {
    const withHash = { ...entry, id: "1", state: "sent", createdAtMs: 1_000_000, txHash: "0xabc" } as IntentRecord;
    expect(await reconcileRecord({ client: { getTransactionReceipt: async () => ({ status: "success" }) } as never, wallet: WALLET, record: withHash, chainNowSec: 2_000 })).toBe("confirmed");
    expect(await reconcileRecord({ client: { getTransactionReceipt: async () => ({ status: "reverted" }) } as never, wallet: WALLET, record: withHash, chainNowSec: 2_000 })).toBe("reverted");
    const noHash = { ...entry, id: "2", state: "unknown", createdAtMs: 1_000_000 } as IntentRecord;
    expect(await reconcileRecord({ client: noReceipt as never, wallet: WALLET, record: noHash, chainNowSec: 1_025 + EXPIRY_GRACE_SEC - 1, evidence: async () => "absent" })).toBe("unknown");
    expect(await reconcileRecord({ client: noReceipt as never, wallet: WALLET, record: noHash, chainNowSec: 1_025 + EXPIRY_GRACE_SEC, evidence: async () => "absent" })).toBe("absent");
    expect(await reconcileRecord({ client: noReceipt as never, wallet: WALLET, record: noHash, chainNowSec: 5_000 })).toBe("unknown");
  });

  it("recovery never re-sends: absent → failed, landed → confirmed, stale unknown → expired after 24 h", async () => {
    const journal = createMemoryJournal(() => 0);
    const r = await journal.record(entry);
    const results = await recoverUnresolved(journal, WALLET, async () => "absent", 1);
    expect(results[0]).toMatchObject({ outcome: "absent" });
    expect(await journal.listUnresolved(WALLET)).toEqual([]);
    const j2 = createMemoryJournal(() => 0);
    await j2.record(entry);
    expect((await recoverUnresolved(j2, WALLET, async () => "unknown", 24 * 3_600_000 + 1))[0]).toMatchObject({ outcome: "expired" });
    void r;
  });
});
