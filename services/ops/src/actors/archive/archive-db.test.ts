/**
 * D-188 over a real Postgres (`TEST_DATABASE_URL`; each run creates and drops its own database). The archived boundary
 * is the real one at 2026-09-30 08:00:00Z (04:00 ET) — BTC, TSLA and NY_MARKET_NEXT_CHANGE_TIME 5/5, `TSLA---24_7`
 * none — exported from the testnet `print_archive`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSql, runMigrations, type Sql } from "@cwf/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import venueSpec from "@cwf/core/venue-spec.json" with { type: "json" };
import { latestBody } from "../../http/prices";
import { archivedFeed } from "../price-relay/proofs";
import { archivePass } from "./index";

const url = process.env.TEST_DATABASE_URL;
const GAP_T = 1_790_755_200;
type Pkg = { timestampMilliseconds: number; dataPoints: { value: number }[] };
const recorded = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "redstone-1790755200.json"), "utf8")) as Record<string, Pkg[]>;
const signers = new Set(venueSpec.redstone.signers.map((s) => s.toLowerCase()));

describe.skipIf(!url)("print_archive holds objects every reader can query (D-188)", () => {
  const db = `t_archive_${Date.now().toString(36)}`;
  let admin: Sql;
  let sql: Sql;
  beforeAll(async () => {
    admin = createSql(url);
    await admin.unsafe(`create database ${db}`);
    const u = new URL(url!);
    u.pathname = `/${db}`;
    sql = createSql(u.toString());
    await runMigrations(sql);
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop database if exists ${db}`);
    await admin?.end();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("the old writer stored a JSON string no reader could see into; the migration unwraps it", async () => {
    await sql`insert into print_archive (source, t_sec, complete, summary, feeds) values ('redstone', ${GAP_T - 300}, false, ${JSON.stringify({ BTC: { signers: 5 } })}::jsonb, ${JSON.stringify(recorded)}::jsonb)`;
    const [before] = await sql`select jsonb_typeof(feeds) as kind, (feeds -> 'BTC') is null as unseen from print_archive where t_sec = ${GAP_T - 300}`;
    expect(before).toEqual({ kind: "string", unseen: true });
    await sql`delete from schema_migrations where id = 'prints/0003_print_archive_objects.sql'`;
    expect(await runMigrations(sql)).toEqual(["prints/0003_print_archive_objects.sql"]);
    const [after] = await sql`select jsonb_typeof(feeds) as kind, jsonb_array_length(feeds -> 'BTC') as btc, (summary -> 'BTC' ->> 'signers')::int as signers from print_archive where t_sec = ${GAP_T - 300}`;
    expect(after).toEqual({ kind: "object", btc: 5, signers: 5 });
  });

  it("the archive actor stores objects: the relay's proof read, the web's key test and /prices/latest's fallback find them", async () => {
    vi.useFakeTimers({ now: (GAP_T + 330) * 1000, toFake: ["Date"] });
    // The gateway's historical answer at T: the recorded packages, restamped at the T asked for.
    vi.stubGlobal("fetch", vi.fn(async (req: string) => {
      const tMs = Number(req.split("/").at(-1));
      const body = Object.fromEntries(Object.entries(recorded).map(([feed, pkgs]) => [feed, pkgs.map((p) => ({ ...p, timestampMilliseconds: tMs }))]));
      return new Response(JSON.stringify(body));
    }));
    const pass = await archivePass(sql)();
    expect(pass.detail).toMatchObject({ saved: 2 }); // 08:00:00Z and 08:05:00Z (fetched 15 s after T)
    const btc = JSON.parse((await archivedFeed(sql, "BTC", GAP_T))!) as Pkg[];
    expect(btc.map((p) => p.timestampMilliseconds)).toEqual(Array(5).fill(GAP_T * 1000));
    expect(btc[0]!.dataPoints[0]!.value).toBe(83262.77456189);
    // The 04:00 ET gap itself is on record: no `TSLA---24_7` package at T.
    expect(await archivedFeed(sql, "TSLA---24_7", GAP_T)).toBe("[]");
    const [row] = await sql`select feeds ? 'BTC' as has_btc, (summary -> 'TSLA---24_7' ->> 'signers')::int as gap_signers from print_archive where t_sec = ${GAP_T}`;
    expect(row).toEqual({ has_btc: true, gap_signers: 0 });
    const latest = await latestBody(null, sql, signers, GAP_T + 330);
    expect(latest.BTC).toMatchObject({ source: "archive", publishTimeSec: GAP_T + 300, signers: 5, fresh: true });
    expect(latest["TSLA-24"]).toBeUndefined();
  });
});
