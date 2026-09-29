/**
 * Fetches RedStone packages from the public gateway and writes the verifier wire payload + a JSON description.
 * Usage: pnpm exec tsx scripts/drive/redstone-fixture.ts <FEED> <latest|tSec> <outBase>
 *   latest → the gateway's latest packages (verifySpot, X12); tSec → the historical packages at exactly T (verifyPrint).
 */
import { writeFileSync } from "node:fs";
import {
  packagesAt,
  parseGatewayJson,
  redstoneHistoricalUrl,
  redstoneLatestUrl,
  redstoneMedianE8,
  redstonePayload,
  decimalToE8,
  toHex,
} from "./lib/redstone-payload.js";

const [feed, when, outBase] = process.argv.slice(2);
if (!feed || !when || !outBase) throw new Error("usage: redstone-fixture.ts <FEED> <latest|tSec> <outBase>");
const url = when === "latest" ? redstoneLatestUrl() : redstoneHistoricalUrl(Number(when));
const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
if (res.status !== 200) throw new Error(`gateway ${res.status} for ${url}`);
const all = parseGatewayJson(await res.text());
const candidates = all[feed] ?? [];
if (candidates.length === 0) throw new Error(`no ${feed} packages`);
const tMs = when === "latest" ? Math.max(...candidates.map((p) => p.timestampMilliseconds)) : Number(when) * 1000;
const pkgs = packagesAt(all, feed, tMs);
const payload = redstonePayload(pkgs, feed);
const values = pkgs.map((p) => decimalToE8(String(p.dataPoints[0]!.value)));
const description = {
  feed,
  url,
  fetchedAtUtc: new Date().toISOString(),
  timestampMs: tMs,
  signers: pkgs.map((p) => p.signerAddress),
  valuesE8: values.map(String),
  medianE8: String(redstoneMedianE8(values)),
  payloadBytes: payload.length,
};
writeFileSync(`${outBase}.hex`, toHex(payload).slice(2) + "\n");
writeFileSync(`${outBase}.json`, JSON.stringify(description, null, 2) + "\n");
console.log(JSON.stringify({ ...description, signers: description.signers.length }));
