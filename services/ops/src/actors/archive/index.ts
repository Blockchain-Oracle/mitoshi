/** The `archive` actor: stores RedStone prints for every boundary T into `print_archive` (plan S0.11). Signs nothing. */
import type { Sql } from "@cwf/db";
import type { PassResult } from "../../runtime";
import { boundaries, fetchSnapshot, FETCH_DELAY_SEC, RETENTION_SEC } from "./redstone";

export const ARCHIVE_EVERY_MS = 20_000;
/** The JSON value as stored (a missing value in an array becomes null, as `JSON.stringify` writes it). */
export const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Parameters<Sql["json"]>[0];
const MAX_PER_PASS = 60;

export function archivePass(sql: Sql): () => Promise<PassResult> {
  return async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const [row] = await sql<{ last: string | null }[]>`select max(t_sec)::text as last from print_archive where source = 'redstone'`;
    const floor = nowSec - RETENTION_SEC;
    const fromSec = Math.max(floor, row?.last ? Number(row.last) : floor);
    const due = boundaries(fromSec, nowSec - FETCH_DELAY_SEC).slice(0, MAX_PER_PASS);
    let saved = 0;
    let incomplete = 0;
    for (const tSec of due) {
      const snap = await fetchSnapshot(tSec);
      if (!snap) break;
      // `sql.json`: a `JSON.stringify(x)::jsonb` parameter is serialized again by postgres.js and stored as a JSON string (D-188).
      await sql`insert into print_archive (source, t_sec, complete, summary, feeds)
                values ('redstone', ${snap.tSec}, ${snap.complete}, ${sql.json(asJson(snap.summary))}, ${sql.json(asJson(snap.feeds))})
                on conflict (source, t_sec) do nothing`;
      saved++;
      if (!snap.complete) incomplete++;
    }
    const lastT = due.length ? due[Math.min(saved, due.length) - 1] : undefined;
    return {
      why: saved ? `archived ${saved} boundary(ies)${incomplete ? `, ${incomplete} with < 3 signers` : ""}` : "up to date",
      detail: { saved, incomplete, lastT: lastT ?? null, backlog: due.length - saved },
      nextDelayMs: due.length === MAX_PER_PASS && saved === MAX_PER_PASS ? 1_000 : undefined,
    };
  };
}
