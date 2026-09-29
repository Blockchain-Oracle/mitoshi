/**
 * A real MPP-paid request on Moderato through the production payer (plan C.5.3, S3.5 gate evidence on testnet): the
 * `mpp-payer` access key, signing for `mpp-root` under its TIP-1011 daily limit, pays `mpp.dev/api/ping/paid` (a
 * Moderato charge endpoint) with the charge intent; the receipt hook writes the `mpp_receipts` row to DATABASE_URL
 * under a decision scope, which is read back. Test pathUSD only — mainnet MPP waits for Q-020.
 *
 *   DATABASE_URL=postgres://… tsx scripts/mpp/pay.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAddress, type Hex } from "viem";
import { createSql, insertMppReceipt, receiptsForDecision, runMigrations } from "@cwf/db";
import { createMppPayer, defaultMppCaps, defaultPayerLimits, readPayerKey, withReceiptScope } from "@cwf/markets/server";
import { tempoReadClient } from "@cwf/markets";

const moderato = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);

const PATH_USD = "0x20c0000000000000000000000000000000000000";
const role = (r: string) => JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", `${r}.json`), "utf8")) as { address: string; privateKey: Hex };
const root = getAddress(role("mpp-root").address);
const keyId = getAddress(role("mpp-payer").address);

const sql = createSql();
await runMigrations(sql);
const before = await readPayerKey(moderato, root, keyId, [getAddress(PATH_USD)]);

const payer = createMppPayer({
  network: "testnet",
  privateKey: role("mpp-payer").privateKey,
  root,
  caps: defaultMppCaps("testnet", { [PATH_USD]: { perRequestBase: 200_000n, perDayBase: defaultPayerLimits("testnet")[0]!.amountBase } }),
  sink: (row) => insertMppReceipt(sql, row).then(() => undefined),
  onSinkError: (e) => console.error(`receipt not stored: ${e instanceof Error ? e.message : String(e)}`),
});

const decisionId = `s3.5-pay-${Date.now()}`;
const response = await withReceiptScope({ decisionId, purpose: "s3.5 gate (testnet)" }, () => payer.fetch("https://mpp.dev/api/ping/paid"));
console.log(`GET mpp.dev/api/ping/paid → ${response.status} "${(await response.text()).trim()}"`);

const stored = await receiptsForDecision(sql, decisionId);
for (const r of stored) console.log(`mpp_receipts #${r.id}: ${r.intent} ${r.status} ${r.amountBase} base of ${r.currency} → reference ${r.reference} (decision ${r.decisionId})`);
const after = await readPayerKey(moderato, root, keyId, [getAddress(PATH_USD)]);
console.log(`payer key ${keyId} for root ${root}: pathUSD daily limit remaining ${before.limits[0]!.remainingBase} → ${after.limits[0]!.remainingBase}`);
await sql.end();
if (!stored.length || stored[0]!.status !== "paid") throw new Error("no paid receipt stored");
