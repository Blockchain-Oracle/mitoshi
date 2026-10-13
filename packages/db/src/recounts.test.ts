/**
 * The recount's record on a real Postgres (`TEST_DATABASE_URL`; a fresh schema per run; R6): an item's rows and its
 * tile land together, a mismatched item stores rows but leaves its tile alone, and tiles read back exactly (bigints,
 * gaps) so the next pass resumes where the last one stopped.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RecountRow, TileState } from "@cwf/markets/server";
import { runMigrations } from "./migrations";
import { commitRecount, loadRecountTiles } from "./recounts";

const url = process.env.TEST_DATABASE_URL;

const row = (over: Partial<RecountRow> = {}): RecountRow => ({
  chainId: 42431, kind: "new", area: "engine", contract: "EventsEngine", address: "0x113Ca86bE942671E5290Ed57d86297F0Ecd61b6a", event: "Filled",
  topic0: "0x4678662051dfdde3614d84316fe95ea4f0c45d0105190ba4b2610bb72fd64cf6", fromBlock: 38_700_000n, toBlock: 38_719_999n, heldBlocks: 12_662n, gapBlocks: 7_338n,
  indexerCount: 21_042n, localCount: 21_042n, localSource: "rpc", match: true, ...over,
});

describe.skipIf(!url)("recount store", () => {
  const schema = `t_${Date.now().toString(36)}_rc`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
  }, 60_000);
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema if exists ${schema} cascade`);
    await admin?.end();
  });

  it("commits an item's rows with its tile, keeps a mismatched item's tile open, and reads tiles back exactly", async () => {
    const tile: TileState = { tileFrom: 38_700_000n, from: 38_700_000n, to: 38_719_999n, addresses: ["0x113ca86be942671e5290ed57d86297f0ecd61b6a"], gaps: [{ from: 38_712_662n, to: 38_719_999n }] };
    await commitRecount(sql, { chainId: 42431, via: "api-key", tile, rows: [row(), row({ event: "Matched", topic0: "0xa669f01e54311b4f70f92a8c0e1fd805ee3972bd969a0585de051ddbf215ef04" })] });
    await commitRecount(sql, { chainId: 42431, via: "api-key", tile: null, rows: [row({ fromBlock: 38_720_000n, toBlock: 38_739_999n, indexerCount: 5n, localCount: 6n, match: false })] });
    expect(await loadRecountTiles(sql, 42431, "api-key")).toEqual([tile]);
    expect(await loadRecountTiles(sql, 42431, "self-hosted")).toEqual([]);

    // The next pass refills the gap: the same tile, updated in place.
    await commitRecount(sql, { chainId: 42431, via: "api-key", tile: { ...tile, gaps: [] }, rows: [] });
    expect((await loadRecountTiles(sql, 42431, "api-key"))[0]!.gaps).toEqual([]);

    const stored = await sql<{ kind: string; held_blocks: string; gap_blocks: string; match: boolean; address: string }[]>`select kind, held_blocks::text, gap_blocks::text, match, address from indexer_recounts order by id`;
    expect(stored.map((r) => [r.kind, r.held_blocks, r.gap_blocks, r.match])).toEqual([["new", "12662", "7338", true], ["new", "12662", "7338", true], ["new", "12662", "7338", false]]);
    expect(stored[0]!.address).toBe("0x113ca86be942671e5290ed57d86297f0ecd61b6a");
  });
});
