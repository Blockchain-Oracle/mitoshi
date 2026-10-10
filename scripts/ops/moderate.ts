#!/usr/bin/env -S pnpm exec tsx
/**
 * The moderator's side of the queue (S13, D-043): ops' `moderation` actor shows how many reports are open; this lists
 * them with the reported text as written, and acts on one — `hide` takes the room message or take out of every read (and
 * clears a reported profile's name and bio), closing every open report on it; `dismiss` closes the one report.
 *
 *   DATABASE_URL=… pnpm --dir scripts exec tsx ops/moderate.ts list
 *   DATABASE_URL=… pnpm --dir scripts exec tsx ops/moderate.ts hide <report id>
 *   DATABASE_URL=… pnpm --dir scripts exec tsx ops/moderate.ts dismiss <report id>
 */
import { createPgSocialModeration, createSql } from "@cwf/db";

const [command, id] = process.argv.slice(2);
const sql = createSql();
const store = createPgSocialModeration(sql);
try {
  if (command === "list") {
    const open = await store.openReports(200);
    if (open.length === 0) console.log("no open reports");
    for (const r of open) {
      console.log(`#${r.id}  ${new Date(r.createdAtMs).toISOString()}  ${r.reason}  ${r.targetKind} ${r.targetId}${r.targetAuthor ? `  by ${r.targetAuthor}` : ""}  (reported by ${r.reporter})`);
      if (r.text) console.log(`      "${r.text}"`);
      if (r.note) console.log(`      note: ${r.note}`);
    }
  } else if ((command === "hide" || command === "dismiss") && id && /^\d+$/.test(id)) {
    console.log((await store.resolve(id, command)) ? `#${id}: ${command === "hide" ? "hidden, every open report on it closed" : "dismissed"}` : `#${id}: no open report with that id`);
  } else {
    console.log("usage: moderate.ts list | hide <report id> | dismiss <report id>");
    process.exitCode = 2;
  }
} finally {
  await sql.end();
}
