/**
 * Print proofs per source (engine A.5): RedStone packages from the gateway at T (or, for a Gap open past the gateway's
 * ≈ 24 h history, from `print_archive`), a Data Streams `fullReport` at T (mainnet, Q-011), an EIP-712 attestation
 * (opt-in demo data). Each returns the proof bytes or why it can't yet. Ported in role from Agari
 * 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/price-relay/{relay-pass,gap-slots,attest-sign}.ts.
 */
import type { Sql } from "@cwf/db";
import { attestedPrintProof, dataStreamsEnv, feedAt, feedIdToAscii, fetchReportAt, redstonePayload, toHex, type DataStreamsEnv } from "@cwf/markets/ops";
import type { Hex, LocalAccount } from "viem";
import type { RedstoneSources } from "../../prices/redstone-gateway";
import type { BoundaryCache } from "./boundary-cache";
import { redstoneNeed, SOURCE, type PrintSlot } from "./slots";

/** The gateway keeps ≈ 24 h; from 23 h the archive is the source of a Gap's Friday print. */
export const ARCHIVE_FROM_SEC = 23 * 3_600;
/**
 * First ask for T's packages at T + 3 s: the historical endpoint carried 2 of 5 signers at T + 0–3 s and all five from
 * T + 4 s (measured 2026-10-13 on both public gateways); the boundary cache asks again every 2 s until it has them.
 * It was T + 10 s, ten seconds of every Window spent waiting for nothing (D-230).
 */
export const REDSTONE_FETCH_AFTER_SEC = 3;

export type ProofResult = { proof: Hex; note: string } | { wait: string } | { unavailable: string };

export interface ProofContext {
  sources: RedstoneSources;
  cache: BoundaryCache;
  sql: Sql | null;
  engine: `0x${string}`;
  chainId: number;
  network: "mainnet" | "testnet";
  attestor: LocalAccount | null;
  attested: boolean;
  datastreams: DataStreamsEnv | null;
}

export async function archivedFeed(sql: Sql, feed: string, tSec: number): Promise<string | null> {
  const [row] = await sql<{ pkgs: string | null }[]>`select (feeds -> ${feed}::text)::text as pkgs from print_archive where source = 'redstone' and t_sec = ${tSec}`;
  return row?.pkgs ?? null;
}

async function redstone(ctx: ProofContext, slot: PrintSlot, nowSec: number, wallSec: number): Promise<ProofResult> {
  const feed = feedIdToAscii(slot.feedId);
  const need = redstoneNeed(slot, nowSec, ctx.sources.signerCount, ctx.sources.threshold);
  let text: string | null = null;
  let from = "gateway";
  if (slot.slot === "open" && wallSec - slot.boundarySec >= ARCHIVE_FROM_SEC) {
    if (!ctx.sql) return { unavailable: `${feed} T ${slot.boundarySec} is past the gateway's history and there is no archive` };
    const pkgs = await archivedFeed(ctx.sql, feed, slot.boundarySec);
    if (!pkgs) return { unavailable: `${feed} T ${slot.boundarySec} not archived` };
    text = `{${JSON.stringify(feed)}:${pkgs}}`;
    from = "archive";
  } else {
    if (wallSec < slot.boundarySec + REDSTONE_FETCH_AFTER_SEC) return { wait: "before fetch time" };
    const response = await ctx.cache.redstone(slot.boundarySec);
    if (!response) return { wait: `no gateway data yet${ctx.cache.error(slot.boundarySec) ? ` (${ctx.cache.error(slot.boundarySec)})` : ""}` };
    text = response.text;
    if (response.keyed) from = "gateway, key";
  }
  const at = feedAt(text, feed, slot.boundarySec, ctx.sources.signers);
  const have = at?.packages.length ?? 0;
  if (!at || have < need) return { wait: `${have}/${need} signers (${from})` };
  return { proof: toHex(redstonePayload(at.packages, feed)), note: `${feed} ${at.medianE8} ×${have} (${from})` };
}

async function datastreams(ctx: ProofContext, slot: PrintSlot): Promise<ProofResult> {
  if (!ctx.datastreams) return { unavailable: "no Data Streams credentials (Q-011)" };
  const { status, report } = await fetchReportAt(ctx.datastreams, slot.feedId, slot.boundarySec);
  if (!report) return status === 404 ? { wait: "no report covering T yet" } : { wait: `Data Streams HTTP ${status}` };
  if (report.validFromSec > slot.boundarySec || report.observationsSec < slot.boundarySec) return { wait: "report window does not cover T yet" };
  return { proof: report.fullReport, note: `datastreams report ${report.observationsSec}` };
}

/** Demo data (`RELAY_ATTESTED=1`): RedStone's median at T for the Series' ticker, signed by the attestor. */
async function attested(ctx: ProofContext, slot: PrintSlot, nowSec: number): Promise<ProofResult> {
  if (!ctx.attested || !ctx.attestor) return { unavailable: "attested prints are off (RELAY_ATTESTED≠1 or no attestor key)" };
  const ticker = slot.series.symbol;
  if (!ticker) return { unavailable: "no ticker" };
  const response = await ctx.cache.redstone(slot.boundarySec);
  const median = response ? feedAt(response.text, ticker, slot.boundarySec, ctx.sources.signers)?.medianE8 : null;
  if (!median) return { wait: `no RedStone ${ticker} value at T to attest` };
  const fetchedAtSec = Math.max(slot.earliestSec, Math.min(nowSec, Math.floor(Date.now() / 1000)));
  const proof = await attestedPrintProof(ctx.attestor, { engine: ctx.engine, chainId: ctx.chainId, marketId: slot.market.marketId, which: { open: 0, close: 1, checkOpen: 2, checkClose: 3 }[slot.slot], tSec: slot.boundarySec, feedId: slot.feedId, barLenSec: slot.barLenSec, priceE8: median, fetchedAtSec });
  return { proof, note: `attested ${ticker} ${median} (demo data)` };
}

export async function proofFor(ctx: ProofContext, slot: PrintSlot, nowSec: number): Promise<ProofResult> {
  const wall = Math.floor(Date.now() / 1000);
  if (slot.source === SOURCE.redstone) return redstone(ctx, slot, nowSec, wall);
  if (slot.source === SOURCE.datastreams) return datastreams(ctx, slot);
  if (slot.source === SOURCE.attested) return attested(ctx, slot, nowSec);
  return { unavailable: `source ${slot.source} has no relay` };
}

export const loadDataStreams = (network: "mainnet" | "testnet") => dataStreamsEnv(network);
