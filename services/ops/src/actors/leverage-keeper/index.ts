// Ported from Masayume 68f7a09:services/ops/src/actors/leverage-keeper/{index,env}.ts — onto `runActor` (one pass at a
// time, a why-string per pass, backoff, heartbeat) and the ops write path (`sendOps`: simulate, then a self-paid
// expiring-nonce Tempo tx from the `keeper` role). A knock-out carries its own RedStone spot proof (PD-2, D-174).
/**
 * leverage-keeper (plan S10c): watches every LIVE boost of the LeverageReserve and cranks what the contract already
 * lets anyone crank — `settle` once the engine has decided a Window, `knockOut` once rested depth takes the whole
 * position under the maintenance line and the fair-value model at a fresh verified spot agrees. Both pay the owner,
 * never the keeper. No `keeper` key (`KEEPER_PRIVATE_KEY` / `keeper.json`) or `DRY_RUN` → scan and report only.
 */
import { decodeErrorResult, encodeFunctionData, type Hex } from "viem";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { leverageReserveAbi } from "@cwf/clients/abis/LeverageReserve";
import { deploymentOf } from "@cwf/markets";
import { createOpsClient, feedIdToAscii, OpsSendError, sendOps, venueOf } from "@cwf/markets/ops";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";
import { fetchRedstoneLatest } from "../../prices/redstone-gateway";
import { decidePosition, type BookMark, type FairMark } from "./decide";
import { spotProofOf, type SpotProof } from "../../prices/spot-proof";

const DEFAULT_REFRESH_MS = 20_000;
/** "Someone got there first" or "not any more": look again next pass rather than count a failure. */
const BENIGN = new Set(["NotLive", "StillHealthy", "FairValueHealthy", "ThinBook", "MarketNotSettled", "SpotTooOld"]);

/** The reserve's own custom error in a failed send (the ops path decodes only engine errors), or null. */
function reserveErrorName(error: unknown): string | null {
  const hex = /(0x[0-9a-fA-F]{8,})/.exec(errorText(error))?.[1];
  if (!hex) return null;
  try {
    return decodeErrorResult({ abi: leverageReserveAbi, data: hex as Hex }).errorName;
  } catch {
    return null;
  }
}

export function leverageKeeperRefreshMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.LK_REFRESH_MS);
  return Number.isFinite(n) && n >= 5_000 ? n : DEFAULT_REFRESH_MS;
}

export function startLeverageKeeper(deps: VenueDeps): { stop: () => void } {
  const key = roleKey("keeper", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key, tier: 1 });
  const venue = venueOf(client.chainId);
  const reserve = deploymentOf("leverage", client.chainId)?.LeverageReserve?.address ?? null;
  const dryRun = deps.env.dryRun || !key;
  if (!key) deps.log("KEEPER_PRIVATE_KEY / keeper.json missing: scanning and reporting only");
  const counts: Record<string, number> = {};
  let recent: Array<{ action: string; positionId: string; tx: string }> = [];
  const feeds = new Map<string, string>();

  const read = <T>(address: Hex, abi: unknown, functionName: string, args: readonly unknown[] = []) =>
    client.public.readContract({ address, abi: abi as never, functionName: functionName as never, args: args as never }) as Promise<T>;

  /** The RedStone feed the guard verifies for a Window's ticker (read once per ticker). */
  const feedOf = async (guard: Hex, ticker: number): Promise<string | null> => {
    const k = `${guard}:${ticker}`;
    if (!feeds.has(k)) {
      const [verifier, feedId] = await read<readonly [Hex, Hex]>(guard, fairValueGuardAbi, "spotSourceOf", [ticker]);
      feeds.set(k, verifier === "0x0000000000000000000000000000000000000000" ? "" : feedIdToAscii(feedId));
    }
    return feeds.get(k) || null;
  };

  const send = async (label: string, data: Hex): Promise<string> => {
    if (dryRun) return `DRY ${label}`;
    try {
      const sent = await sendOps(client, [{ to: reserve!, data }]);
      counts[label.split(" ")[0]!] = (counts[label.split(" ")[0]!] ?? 0) + 1;
      recent = [{ action: label, positionId: label.split("#")[1] ?? "", tx: sent.hash }, ...recent].slice(0, 20);
      return `${label} ${sent.hash.slice(0, 10)}`;
    } catch (error) {
      const name = (error instanceof OpsSendError ? error.errorName : null) ?? reserveErrorName(error);
      if (name && BENIGN.has(name)) return `${label}: ${name}`;
      counts.failed = (counts.failed ?? 0) + 1;
      return `${label} failed: ${errorText(error).slice(0, 140)}`;
    }
  };

  const pass = async () => {
    if (!reserve || !venue) return { why: "LeverageReserve is not deployed on this network; idle" };
    const guard = await read<Hex>(reserve, leverageReserveAbi, "guard");
    const open = await read<readonly bigint[]>(reserve, leverageReserveAbi, "openPositions");
    const notes: string[] = [];
    let latest: string | null = null;
    const proofs = new Map<string, SpotProof | null>();
    for (const id of open) {
      const p = await read<{ marketId: Hex; quantityRaw: bigint }>(reserve, leverageReserveAbi, "positionOf", [id]);
      const [resolved, voided] = await Promise.all([
        read<boolean>(venue.lens, engineLensAbi, "isResolved", [p.marketId]),
        read<boolean>(venue.lens, engineLensAbi, "isVoided", [p.marketId]),
      ]);
      let mark: BookMark | null = null;
      try {
        const [markRaw, filledRaw, lineRaw, knockable] = await read<readonly [bigint, bigint, bigint, boolean]>(reserve, leverageReserveAbi, "markOf", [id]);
        mark = { markRaw, filledRaw, lineRaw, knockable };
      } catch {
        mark = null;
      }
      const view = { positionId: id, marketId: p.marketId, quantityRaw: p.quantityRaw };
      let action = decidePosition(view, resolved || voided, mark, null);
      let proof: SpotProof | null = null;
      if (action.kind === "hold" && action.needsSpot) {
        const ref = await read<{ ticker: number }>(venue.lens, engineLensAbi, "marketRef", [p.marketId]);
        const feed = await feedOf(guard, ref.ticker);
        if (!feed) {
          notes.push(`#${id}: no spot source for ticker ${ref.ticker}`);
          continue;
        }
        if (!proofs.has(feed)) {
          latest ??= (await fetchRedstoneLatest(deps.redstone.gateways)).text;
          proofs.set(feed, spotProofOf(latest, feed, deps.redstone.signers, deps.redstone.threshold));
        }
        proof = proofs.get(feed) ?? null;
        if (!proof) {
          notes.push(`#${id}: no RedStone ${feed} spot with ${deps.redstone.threshold} signers`);
          continue;
        }
        const [fairMarkRaw, knockable] = await read<readonly [bigint, boolean]>(reserve, leverageReserveAbi, "fairMarkOf", [id, proof.medianE8]);
        const fair: FairMark = { fairMarkRaw, knockable };
        action = decidePosition(view, false, mark, fair);
      }
      if (action.kind === "hold") {
        if (action.needsSpot) notes.push(`#${id}: ${action.why}`);
        continue;
      }
      const data =
        action.kind === "settle"
          ? encodeFunctionData({ abi: leverageReserveAbi, functionName: "settle", args: [id] })
          : encodeFunctionData({ abi: leverageReserveAbi, functionName: "knockOut", args: [id, proof!.payload] });
      notes.push(`${await send(`${action.kind} #${id}`, data)} (${action.why})`);
    }
    return {
      why: `${open.length} live · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing sent yet"}${notes.length ? ` | ${notes.join(" | ")}` : ""}${dryRun ? " · DRY RUN" : ""}`,
      detail: { reserve, live: open.length, counts: { ...counts }, recent },
    };
  };

  return runActor({ name: "leverage-keeper", log: deps.log, dryRun, everyMs: leverageKeeperRefreshMs(), pass });
}
