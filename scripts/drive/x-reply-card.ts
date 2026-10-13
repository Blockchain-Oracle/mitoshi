/**
 * S11 (D-227): the x-relay's receipt card for a REAL fill, every fact read back from Moderato — the `Executed` event in
 * the transaction's receipt (owner, grant, Window, side, cash, contracts) and the Window's Series and expiry — through
 * the relay's own formatter and renderer (`reply-format.ts`, `reply-card.ts`). The PNG is written to `--out`.
 *
 * `--upload` also uploads the PNG as the bot, through the way in the relay itself picks (its Rettiwt session): an
 * upload only — X keeps an unattached image for a day and shows it to no one. Nothing is posted. Only the media id is
 * printed; no credential is.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/x-reply-card.ts [--tx 0x…] [--handle s11_drive] [--out /tmp/card.png] [--upload]
 *   (with --upload, X_HANDLE and X_RETTIWT_API_KEY in the environment, e.g. from services/ops/.env.local)
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseEventLogs, type Hex } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import type { XReceipt } from "@cwf/core";
import { createOpsClient, fetchMarkets, listSeries, marketIdOf, xVenueOf } from "@cwf/markets/ops";
import { readRelayEnv } from "../../services/ops/src/actors/x-relay/env";
import { chooseReader } from "../../services/ops/src/actors/x-relay/reading";
import { renderReplyCardPng } from "../../services/ops/src/actors/x-relay/reply-card";
import { replyPresentation, replyTextOf } from "../../services/ops/src/actors/x-relay/reply-format";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
// The S11 gate's live fill (acceptance/S11.md): grant 16, BTC 5m, $4.86 for 9.31 contracts.
const TX = arg("tx", "0xf0d1a96aee563d31effba0ff9aabcde045ee6e9198c3eccb43eca77b5521624a") as Hex;
const HANDLE = arg("handle", "s11_drive");
const OUT = arg("out", "x-reply-card.png");
const SITE = process.env.APP_ORIGIN?.trim() || "https://testnet.mitoshi.xyz";
const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const out = (step: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

const ops = createOpsClient({ network: "testnet", rpcUrl: RPC, privateKey: null, unitsPerSec: 0 });
const xv = xVenueOf(ops.chainId);
if (!xv) throw new Error("EventVaultV2 is not deployed on this network");

const tx = await ops.public.getTransactionReceipt({ hash: TX });
if (tx.status !== "success") throw new Error(`${TX} did not succeed`);
const fill = parseEventLogs({ abi: eventVaultV2Abi, eventName: "Executed", logs: tx.logs }).find((l) => l.address.toLowerCase() === xv.vault.toLowerCase() && l.args.isBuy);
if (!fill) throw new Error(`${TX} has no buy Executed on the vault`);
const marketId = fill.args.marketId;
const [market] = await fetchMarkets(ops, xv, [marketId]);
const series = (await listSeries(ops, xv)).find((s) => market && marketIdOf(s.seriesId, market.index).toLowerCase() === marketId.toLowerCase());
if (!market || !series) throw new Error(`Window ${marketId} not found`);
out("chain", { tx: TX, block: tx.blockNumber, owner: fill.args.owner, grant: fill.args.grantId, marketId, symbol: series.symbol, cadenceSec: series.cadenceSec, lane: series.lane, expirySec: market.expirySec, outcomeIdx: fill.args.outcomeIdx, cashDelta: fill.args.cashDelta, tokenDelta: fill.args.tokenDelta });

const receipt: XReceipt = {
  mentionId: "0", authorId: "0", handle: HANDLE, wallet: fill.args.owner, grantId: fill.args.grantId.toString(), marketId,
  side: fill.args.outcomeIdx === 0 ? "up" : "down", stakeBase: null, status: "filled", reason: null, txHash: TX, instruction: "", atMs: 0,
  asset: series.symbol, intervalSec: series.cadenceSec, expirySec: market.expirySec, lane: series.lane,
  bookedCostBase: fill.args.cashDelta.toString(), bookedContractsRaw: fill.args.tokenDelta.toString(),
};
const presentation = replyPresentation(receipt, "testnet", SITE);
const png = await renderReplyCardPng(presentation);
writeFileSync(OUT, png);
out("card", { out: OUT, bytes: png.length, sha256: createHash("sha256").update(png).digest("hex"), text: replyTextOf(presentation) });

if (process.argv.includes("--upload")) {
  const env = readRelayEnv("testnet");
  const reader = await chooseReader(env);
  if (!reader.transport?.uploadImage) throw new Error(`no way in uploads: ${reader.state.block ?? "?"} — ${reader.state.detail ?? ""}`);
  const mediaId = await reader.transport.uploadImage(png);
  out("upload", { via: reader.transport.via, mediaId, posted: false });
}
